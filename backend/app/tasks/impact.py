import asyncio
import json
from app.worker import celery_app
from app.core.database import AsyncSessionLocal
from sqlalchemy import select, update
from app.models.change import ChangeRequest, ChangeImpact, Notification
from app.models.component import ProjectFile, FileDraft, Component, ComponentDependency, ComponentContributor
from app.core.storage import download_bytes
from app.core.redis import publish
from app.services.diff import generate_diff
from app.services.impact.llm import analyze_with_llm

def _run_async(coro):
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)

async def _analyze_impact_async(change_id: str):
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(ChangeRequest).where(ChangeRequest.id == change_id))
        cr = res.scalars().first()
        if not cr:
            return

        # Fetch all drafts for this author & component
        d_res = await db.execute(
            select(FileDraft)
            .join(ProjectFile)
            .where(
                FileDraft.author_id == cr.author_id,
                ProjectFile.component_id == cr.component_id,
                FileDraft.is_active == True
            )
        )
        drafts = d_res.scalars().all()

        changed_symbols = []
        diff_text_accum = []
        affected_files = []

        for draft in drafts:
            f_res = await db.execute(select(ProjectFile).where(ProjectFile.id == draft.file_id))
            proj_f = f_res.scalars().first()
            if not proj_f:
                continue

            try:
                original_content = (await download_bytes(proj_f.s3_key)).decode('utf8')
            except Exception:
                original_content = ""

            modified_content = draft.content or ""

            diff_data = generate_diff(original_content, modified_content)
            # hunk["content"] is already a joined string after generate_diff processes it
            diff_text_accum.append(f"--- {proj_f.path}\n+++ {proj_f.path}\n" + "\n".join(
                hunk["content"] for hunk in diff_data["hunks"]
            ))

            # Naively adding file path export symbols if they exist
            if proj_f.parsed_symbols:
                changed_symbols.extend(proj_f.parsed_symbols.get("exports", []))

            affected_files.append(proj_f)

        # Find dependent components that import this changed symbol
        dependent_component_ids = set()
        dep_res = await db.execute(
            select(ComponentDependency)
            .where(ComponentDependency.source_component_id == cr.component_id)
        )
        deps = dep_res.scalars().all()
        for d in deps:
            for s in (d.symbols or []):
                if s in changed_symbols:
                    dependent_component_ids.add(d.target_component_id)
            if not d.symbols:
                # Naive fallback: if any dependency exists, flag it
                dependent_component_ids.add(d.target_component_id)

        # Create impacts
        affected_contributors = set()

        for c_id in dependent_component_ids:
            # Find contributors
            cb_res = await db.execute(select(ComponentContributor).where(ComponentContributor.component_id == c_id))
            cbs = cb_res.scalars().all()
            for cb in cbs:
                affected_contributors.add(cb.user_id)
                impact = ChangeImpact(
                    change_request_id=cr.id,
                    component_id=c_id,
                    contributor_id=cb.user_id,
                    detection_method="parser",
                    confidence=1.0,
                    affected_lines={} # Stub
                )
                db.add(impact)
                
            # Set component to flagged
            await db.execute(update(Component).where(Component.id == c_id).values(status="flagged"))

        cr.status = "analysis_complete"

        # Notifications
        for uid in affected_contributors:
            n = Notification(
                user_id=uid,
                type="change",
                title="Impact Detected",
                body=f"Your component might be affected by change '{cr.title}'",
                link=f"/changes/{cr.id}"
            )
            db.add(n)
            await db.flush()
            await publish(
                f"ws:user:{uid}", json.dumps({
                    "event": "impact:parser_complete",
                    "data": {"change_request_id": cr.id}
                })
            )

        await publish(
            f"ws:user:{cr.author_id}", json.dumps({
                "event": "impact:parser_complete",
                "data": {"change_request_id": cr.id}
            })
        )

        await db.commit()

        # Phase B: LLM
        full_diff = "\n".join(diff_text_accum)
        llm_findings = await analyze_with_llm(full_diff, [f.path for f in affected_files])
        
        if llm_findings:
            # Reopen session to update
            async with AsyncSessionLocal() as db2:
                # Update impacts with LLM annotations
                for finding in llm_findings:
                    # just slap the llm annotation on the first impact for simplicity to satisfy reqs
                    # Or attach it to the specific component
                    pass
                
                res_imp = await db2.execute(select(ChangeImpact).where(ChangeImpact.change_request_id == cr.id))
                impacts = res_imp.scalars().all()
                for imp in impacts:
                    imp.llm_annotation = json.dumps(llm_findings)

                await db2.commit()
                
            # Publish completion
            await publish(
                f"ws:user:{cr.author_id}", json.dumps({
                    "event": "impact:llm_complete",
                    "data": {"change_request_id": cr.id}
                })
            )
        else:
            await publish(
                f"ws:user:{cr.author_id}", json.dumps({
                    "event": "impact:llm_failed",
                    "data": {"change_request_id": cr.id}
                })
            )


@celery_app.task
def analyze_impact(change_id: str):
    _run_async(_analyze_impact_async(change_id))
