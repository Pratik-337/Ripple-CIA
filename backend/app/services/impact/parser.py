import tree_sitter
from dataclasses import dataclass, field
from typing import List, Dict, Optional
import tree_sitter_typescript as ts_ts
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import os

from app.models.component import ProjectFile, ComponentDependency, Component
import uuid

@dataclass
class ImportInfo:
    source: str
    symbols: List[str]

@dataclass
class ExportInfo:
    name: str

@dataclass
class ParsedFile:
    imports: List[ImportInfo] = field(default_factory=list)
    exports: List[ExportInfo] = field(default_factory=list)
    definitions: List[str] = field(default_factory=list)
    calls: List[str] = field(default_factory=list)

class TypeScriptExtractor:
    def __init__(self, content: bytes, tree: tree_sitter.Tree):
        self.content = content
        self.tree = tree
        self.root = tree.root_node

    def _get_text(self, node: tree_sitter.Node) -> str:
        return self.content[node.start_byte:node.end_byte].decode("utf8")

    def extract_imports(self) -> List[ImportInfo]:
        imports = []
        # Let's do a rigorous manual AST traversal for robust import/export parsing to bypass TS version inconsistencies.
        def traverse_imports(node: tree_sitter.Node):
            if node.type == 'import_statement':
                source = ""
                symbols = []
                for child in node.children:
                    if child.type == 'string':
                        source = self._get_text(child).strip("'\"")
                    elif child.type == 'import_clause':
                        for gchild in child.children:
                            if gchild.type == 'named_imports':
                                for spec in gchild.children:
                                    if spec.type == 'import_specifier':
                                        for s_child in spec.children:
                                            if s_child.type == 'identifier':
                                                symbols.append(self._get_text(s_child))
                            elif gchild.type == 'identifier': # default import
                                symbols.append(self._get_text(gchild))
                if source:
                    imports.append(ImportInfo(source=source, symbols=symbols))
            else:
                for child in node.children:
                    traverse_imports(child)
                    
        traverse_imports(self.root)
        return imports

    def extract_exports(self) -> List[ExportInfo]:
        exports = []
        def traverse_exports(node: tree_sitter.Node):
            if node.type == 'export_statement':
                for child in node.children:
                    if child.type == 'lexical_declaration' or child.type == 'variable_declaration': # export const ...
                        for var_decl in child.children:
                            if var_decl.type == 'variable_declarator':
                                for v_child in var_decl.children:
                                    if v_child.type == 'identifier':
                                        exports.append(ExportInfo(name=self._get_text(v_child)))
                    elif child.type == 'function_declaration' or child.type == 'class_declaration': # export function, export class
                        for fn_child in child.children:
                            if fn_child.type in ('identifier', 'type_identifier'):
                                exports.append(ExportInfo(name=self._get_text(fn_child)))
                    elif child.type == 'export_clause': # export { foo }
                        for spec in child.children:
                            if spec.type == 'export_specifier':
                                for s_child in spec.children:
                                    if s_child.type == 'identifier':
                                        exports.append(ExportInfo(name=self._get_text(s_child)))
                                        break
            else:
                for child in node.children:
                    traverse_exports(child)
        traverse_exports(self.root)
        return exports

    def extract_definitions(self) -> List[str]:
        return []

    def extract_calls(self) -> List[str]:
        return []

def parse_file(file_path: str, content: str) -> ParsedFile:
    lang = tree_sitter.Language(ts_ts.language_typescript())
    parser = tree_sitter.Parser()
    # Handle API changes between ts0.21 and 0.23:
    try:
        parser.set_language(lang)
    except Exception:
        parser.language = lang # tree_sitter >0.22 property
        
    content_bytes = content.encode("utf8")
    tree = parser.parse(content_bytes)

    extractor = TypeScriptExtractor(content_bytes, tree)
    
    return ParsedFile(
        imports=extractor.extract_imports(),
        exports=extractor.extract_exports(),
        definitons=extractor.extract_definitions(),
        calls=extractor.extract_calls()
    )

async def build_dependency_graph(project_id: str, db: AsyncSession):
    # Fetch all ProjectFile rows for the project
    res = await db.execute(
        select(ProjectFile)
        .where(ProjectFile.project_id == project_id)
        .where(ProjectFile.parsed_symbols != None)
    )
    files = res.scalars().all()
    
    # Build export_index
    export_index = {}
    path_to_file = {}
    
    for f in files:
        # Standardize path
        norm_path = os.path.normpath(f.path)
        path_to_file[norm_path] = f
        
        symbols = f.parsed_symbols or {}
        exports = symbols.get("exports", [])
        for ex in exports:
            export_index[ex] = f

    # Handle resolution and component dependencies
    deps_to_create = []
    
    # To track deduplication: source_component -> target_component
    seen_deps = set()
    
    for src_file in files:
        if not src_file.component_id:
            continue
            
        imports = (src_file.parsed_symbols or {}).get("imports", [])
        
        for imp in imports:
            source_req = imp.get("source")
            if not source_req or not source_req.startswith("."): # absolute or node_modules
                continue
                
            # Naive resolution for relative path
            # src_file.path: e.g. "dashboard/UserPanel.tsx"
            # imp_source: e.g. "../auth/validateUser"
            base_dir = os.path.dirname(src_file.path)
            resolved_base = os.path.normpath(os.path.join(base_dir, source_req))
            
            target_f = None
            
            # Look up path in file index (trying out common extensions)
            for ext in [".ts", ".tsx", ".js", ".jsx"]:
                cand = f"{resolved_base}{ext}"
                if cand in path_to_file:
                    target_f = path_to_file[cand]
                    break
                    
            if not target_f:
                # Can we resolve by symbols exactly?
                symbols_req = imp.get("symbols", [])
                for s in symbols_req:
                    if s in export_index:
                        target_f = export_index[s]
                        break
            
            if target_f and target_f.component_id and target_f.component_id != src_file.component_id:
                dep_key = (src_file.component_id, target_f.component_id)
                if dep_key not in seen_deps:
                    seen_deps.add(dep_key)
                    deps_to_create.append(
                        ComponentDependency(
                            project_id=project_id,
                            source_component_id=src_file.component_id,
                            target_component_id=target_f.component_id,
                            dependency_type="import",
                            confidence=1.0,
                            symbols=imp.get("symbols", []),
                            detection_method="parser"
                        )
                    )
                    
    # Insert new dependencies
    for d in deps_to_create:
        db.add(d)
        
    await db.commit()
