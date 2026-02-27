import os

from tree_sitter import Language, Parser
# Import all grammars
import tree_sitter_c as ts_c
import tree_sitter_c_sharp as ts_c_sharp
import tree_sitter_cpp as ts_cpp
import tree_sitter_go as ts_go
import tree_sitter_java as ts_java
import tree_sitter_javascript as ts_javascript
import tree_sitter_php as ts_php
import tree_sitter_python as ts_python
import tree_sitter_ruby as ts_ruby
import tree_sitter_rust as ts_rust
import tree_sitter_typescript as ts_typescript
from app.core.neo4j_db import neo4j_db
from .extractors import (
    BaseExtractor,
    CExtractor,
    CppExtractor,
    CSharpExtractor,
    GoExtractor,
    JavaExtractor,
    ParsedFile,
    PHPExtractor,
    PythonExtractor,
    RubyExtractor,
    RustExtractor,
    TypeScriptExtractor,
)

# ── 1. Language Detection & Parsing Setup ─────────────────────────────────────

LANGUAGE_EXTENSIONS = {
    "typescript": {".ts"},
    "tsx": {".tsx"},
    "javascript": {".js", ".jsx", ".mjs"},
    "python": {".py"},
    "go": {".go"},
    "rust": {".rs"},
    "java": {".java"},
    "c": {".c", ".h"},
    "cpp": {".cpp", ".cc", ".hpp", ".cxx"},
    "ruby": {".rb"},
    "c_sharp": {".cs"},
    "php": {".php"},
}

_parser_cache: dict[str, Parser] = {}

def get_language_from_path(file_path: str) -> str | None:
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()
    for lang, exts in LANGUAGE_EXTENSIONS.items():
        if ext in exts:
            return "typescript" if lang == "tsx" else lang
    return None

def _load_grammar(language: str) -> Language:
    lang_map = {
        "typescript": ts_typescript.language_typescript(),
        "tsx": ts_typescript.language_tsx(),
        "javascript": ts_javascript.language(),
        "python": ts_python.language(),
        "go": ts_go.language(),
        "rust": ts_rust.language(),
        "java": ts_java.language(),
        "c": ts_c.language(),
        "cpp": ts_cpp.language(),
        "ruby": ts_ruby.language(),
        "c_sharp": ts_c_sharp.language(),
        "php": ts_php.language_php(),
    }
    return Language(lang_map[language], language)

def _get_parser(language: str) -> Parser:
    if language not in _parser_cache:
        parser = Parser()
        parser.set_language(_load_grammar(language))
        _parser_cache[language] = parser
    return _parser_cache[language]

def _get_extractor(language: str) -> BaseExtractor:
    extractors: dict[str, type[BaseExtractor]] = {
        "typescript": TypeScriptExtractor,
        "javascript": TypeScriptExtractor,
        "python": PythonExtractor,
        "go": GoExtractor,
        "rust": RustExtractor,
        "java": JavaExtractor,
        "c": CExtractor,
        "cpp": CppExtractor,
        "ruby": RubyExtractor,
        "c_sharp": CSharpExtractor,
        "php": PHPExtractor,
    }
    return extractors[language]()


# ── 2. Core Parsing Engine ────────────────────────────────────────────────────

def parse_file(file_path: str, file_content: bytes) -> ParsedFile | None:
    """Parses a file and extracts its AST metadata into the unified structure."""
    language = get_language_from_path(file_path)
    if not language:
        return None

    # Handle TSX vs TS dynamically based on actual file path
    if file_path.endswith(".tsx"):
        parser = _get_parser("tsx")
    else:
        parser = _get_parser(language)

    tree = parser.parse(file_content)
    extractor = _get_extractor(language)
    
    return extractor.extract(tree.root_node, file_content, file_path)


def parse_directory_to_neo4j(extract_dir: str, project_id: str):
    """
    Walks through the extracted project directory, parses every supported file,
    and pushes the resulting nodes and relationships into Neo4j.
    """
    all_parsed_files = []

    # 1. Walk the directory and parse every file
    for root, _, files in os.walk(extract_dir):
        for file in files:
            file_path = os.path.join(root, file)

            # Skip if language is not supported
            if not get_language_from_path(file_path):
                continue

            try:
                with open(file_path, "rb") as f:
                    content = f.read()

                parsed_data = parse_file(file_path, content)
                if parsed_data:
                    # Make file paths relative so the graph IDs are clean
                    rel_path = os.path.relpath(file_path, extract_dir)
                    parsed_data.path = rel_path
                    all_parsed_files.append(parsed_data)
            except Exception as e:
                print(f"Error parsing {file_path}: {e}")

    # 2. Format Data for Neo4j
    nodes = []
    relations = []

    for parsed in all_parsed_files:
        file_id = parsed.path
        lang = parsed.language

        # A. Add the file itself as a node
        nodes.append({"id": file_id, "type": "FILE", "language": lang})

        # B. Extract Definitions (Classes, Functions, Methods, Variables)
        for d in parsed.definitions:
            node_id = f"{file_id}::{d.name}"
            kind = d.kind.upper() if d.kind else "UNKNOWN"
            nodes.append({"id": node_id, "type": kind, "language": lang})

            # Relation: File CONTAINS Definition
            relations.append({"from": file_id, "to": node_id, "type": "CONTAINS"})

            # If it's a method belonging to a class, link them!
            if d.parent:
                parent_id = f"{file_id}::{d.parent}"
                relations.append({"from": parent_id, "to": node_id, "type": "OWNS"})

        # C. Extract Imports
        for imp in parsed.imports:
            target_module = imp.source
            nodes.append({"id": target_module, "type": "MODULE", "language": "unknown"})
            # Relation: File IMPORTS Module
            relations.append({"from": file_id, "to": target_module, "type": "IMPORTS"})

        # D. Extract Function Calls (The "Ripple Effect" dependencies)
        for call in parsed.calls:
            # Who is calling? (Either a specific function in this file, or the file itself)
            caller_id = f"{file_id}::{call.parent_def}" if call.parent_def else file_id

            # Who is being called?
            callee_id = call.callee
            nodes.append({"id": callee_id, "type": "EXTERNAL_SYMBOL", "language": lang})

            # Relation: Caller CALLS Callee
            relations.append({"from": caller_id, "to": callee_id, "type": "CALLS"})

    # Deduplicate nodes to speed up the database insert
    unique_nodes = list({n["id"]: n for n in nodes}.values())

    # 3. Bulk Insert into Neo4j
    with neo4j_db.get_session() as session:
        # Insert all Nodes
        session.run("""
            UNWIND $nodes AS n
            MERGE (e:CodeNode {id: n.id})
            SET e.type = n.type, e.language = n.language, e.project_id = $project_id
        """, nodes=unique_nodes, project_id=project_id)

        # Insert all Relationships
        session.run("""
            UNWIND $rels AS r
            MATCH (source:CodeNode {id: r.from, project_id: $project_id})
            MATCH (target:CodeNode {id: r.to})
            MERGE (source)-[rel:DEPENDS_ON]->(target)
            SET rel.type = r.type
        """, rels=relations, project_id=project_id)

    return len(unique_nodes), len(relations)