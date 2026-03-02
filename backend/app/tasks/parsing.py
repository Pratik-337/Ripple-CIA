from app.worker import celery_app
from app.core.database import AsyncSessionLocal
from app.models.component import ProjectFile
from app.models.project import Project
from app.models.change import Notification
from app.core.storage import download_bytes, upload_bytes
from app.core.redis import publish
from app.services.language_detector import detect_language
from app.services.impact.parser import parse_file, build_dependency_graph
import asyncio
import json
import httpx
from sqlalchemy import select

def _run_async(coro):
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)

async def _parse_project_async(project_id: str):
    async with AsyncSessionLocal() as db:
        # fetch owner to notify
        proj_res = await db.execute(select(Project).where(Project.id == project_id))
        proj = proj_res.scalars().first()
        if not proj:
            return

        res = await db.execute(select(ProjectFile).where(ProjectFile.project_id == project_id))
        files = res.scalars().all()
        
        for f in files:
            try:
                content_bytes = await download_bytes(f.s3_key)
                content_str = content_bytes.decode('utf8')
                
                lang = detect_language(f.path)
                f.language = lang
                
                # Parse TypeScript/JavaScript only (other language parsers not implemented)
                if lang in ["typescript", "javascript"]:
                    parsed = parse_file(f.path, content_str)
                    
                    imp_dict = [{"source": i.source, "symbols": i.symbols} for i in parsed.imports]
                    exp_dict = [e.name for e in parsed.exports]
                    
                    symbol_dict = {
                        "imports": imp_dict,
                        "exports": exp_dict,
                        "definitions": parsed.definitions,
                        "calls": parsed.calls
                    }
                    f.parsed_symbols = symbol_dict
                    
            except Exception as e:
                print(f"Failed to parse {f.path}: {e}")
                
        await db.commit()
        
        # Now build dependency graph
        await build_dependency_graph(project_id, db)
        
        # Publish notification via direct database entry and websocket broadcast
        notif = Notification(
            user_id=proj.owner_id,
            type="alert",
            title="Analysis Complete",
            body=f"Parsing for project '{proj.name}' finished successfully.",
            link=f"/projects/{proj.id}"
        )
        db.add(notif)
        await db.commit()
        await db.refresh(notif)
        
        await publish(
            f"ws:user:{proj.owner_id}", 
            json.dumps({
                "event": "project:files_ready",
                "data": {"project_id": project_id}
            })
        )
        await publish(
            f"ws:user:{proj.owner_id}",
            json.dumps({
                "event": "notification:new",
                "data": {
                    "id": notif.id,
                    "title": notif.title,
                    "body": notif.body,
                    "link": notif.link,
                    "created_at": notif.created_at.isoformat()
                }
            })
        )

@celery_app.task
def parse_project(project_id: str):
    _run_async(_parse_project_async(project_id))

async def _import_github_async(project_id: str, repo_url: str, branch: str, github_token: str | None):
    async with AsyncSessionLocal() as db:
        parts = repo_url.rstrip("/").split("/")
        repo_owner, repo_name = parts[-2], parts[-1]
        
        api_url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/git/trees/{branch}?recursive=1"
        headers = {"Accept": "application/vnd.github.v3+json"}
        if github_token:
            headers["Authorization"] = f"token {github_token}"
            
        async with httpx.AsyncClient() as client:
            resp = await client.get(api_url, headers=headers)
            if resp.status_code != 200:
                print(f"GitHub API Error: {resp.text}")
                return
                
        tree_data = resp.json().get("tree", [])
        
        files_to_download = []
        for item in tree_data:
            if item.get("type") == "blob":
                files_to_download.append(item.get("path"))
                
        # download contents using raw git
        import uuid
        
        for path in files_to_download:
            raw_url = f"https://raw.githubusercontent.com/{repo_owner}/{repo_name}/{branch}/{path}"
            async with httpx.AsyncClient() as client:
                f_resp = await client.get(raw_url, headers=headers)
                if f_resp.status_code == 200:
                    c_bytes = f_resp.content
                    
                    unique_uuid = str(uuid.uuid4())
                    file_name = path.split('/')[-1]
                    s3_key = f"projects/{project_id}/{unique_uuid}/{file_name}"
                    
                    await upload_bytes(s3_key, c_bytes, "text/plain")
                    
                    pf = ProjectFile(
                        project_id=project_id,
                        path=path,
                        language=detect_language(path),
                        size_bytes=len(c_bytes),
                        s3_key=s3_key,
                        confirmed=True
                    )
                    db.add(pf)
        await db.commit()
    
    # After download is completely finished, run the parser
    await _parse_project_async(project_id)

@celery_app.task
def import_github_repo(project_id: str, repo_url: str, branch: str, github_token: str | None):
    _run_async(_import_github_async(project_id, repo_url, branch, github_token))
