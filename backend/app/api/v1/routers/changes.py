from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from pydantic import BaseModel
import asyncio
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.component import Component, ComponentContributor, ProjectFile, FileDraft, ProjectSnapshot, SnapshotFile
from app.models.change import ChangeRequest, ChangeImpact, Notification
from app.tasks.impact import analyze_impact
from app.core.redis import publish

router = APIRouter(tags=["changes"])

class ChangeCreateReq(BaseModel):
    component_id: str
    title: str
    description: Optional[str] = None
    draft_ids: List[str] = []
    file_ids: List[str] = []  # Alternative: pass file IDs and we'll look up drafts

@router.post("/projects/{project_id}/changes", status_code=202)
async def submit_change(project_id: str, req: ChangeCreateReq, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify project and component contributor
    has_access = await db.execute(
        select(ComponentContributor)
        .where(
            ComponentContributor.component_id == req.component_id,
            ComponentContributor.user_id == current_user.id
        )
    )
    if not has_access.scalars().first():
        res_p = await db.execute(select(Project).where(Project.id == project_id))
        proj = res_p.scalars().first()
        if not proj or proj.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized on this component")

    # Resolve file_ids to draft_ids if needed
    draft_ids_to_use = list(req.draft_ids)
    if req.file_ids and not req.draft_ids:
        # Look up the latest draft for each file
        for file_id in req.file_ids:
            result = await db.execute(
                select(FileDraft.id)
                .where(FileDraft.file_id == file_id)
                .order_by(FileDraft.created_at.desc())
                .limit(1)
            )
            draft = result.scalar_one_or_none()
            if draft:
                draft_ids_to_use.append(draft)
    
    # verify drafts
    d_res = await db.execute(select(FileDraft).where(FileDraft.id.in_(draft_ids_to_use)))
    drafts = d_res.scalars().all()
    if len(drafts) != len(draft_ids_to_use):
        raise HTTPException(status_code=400, detail="Invalid draft IDs")
        
    for d in drafts:
        f_res = await db.execute(select(ProjectFile).where(ProjectFile.id == d.file_id))
        f = f_res.scalars().first()
        if not f or f.component_id != req.component_id:
            raise HTTPException(status_code=400, detail="Drafts do not belong to the specified component")
            
    # create ChangeRequest
    cr = ChangeRequest(
        project_id=project_id,
        component_id=req.component_id,
        author_id=current_user.id,
        title=req.title,
        description=req.description,
        status="pending_analysis",
    )
    db.add(cr)
    await db.flush()
    
    # create BEFORE snapshot
    snap = ProjectSnapshot(
        project_id=project_id,
        created_by=current_user.id,
        change_request_id=cr.id
    )
    db.add(snap)
    await db.flush()
    
    # populate snapshot_files
    f_res_all = await db.execute(select(ProjectFile).where(ProjectFile.project_id == project_id))
    all_files = f_res_all.scalars().all()
    for af in all_files:
        db.add(SnapshotFile(
            snapshot_id=snap.id,
            file_id=af.id,
            s3_key=af.s3_key
        ))
        
    # update component status
    await db.execute(
        update(Component)
        .where(Component.id == req.component_id)
        .values(status="pending")
    )
    
    await db.commit()
    
    # enqueue celery
    task = analyze_impact.delay(cr.id)
    
    return {"data": {"id": cr.id, "status": "pending_analysis"}, "message": "Impact analysis started"}

@router.get("/projects/{project_id}/changes")
async def list_project_changes(
    project_id: str,
    status: Optional[str] = Query(None),
    author_id: Optional[str] = Query(None),
    component_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # check access
    res = await db.execute(select(Project).where(Project.id == project_id))
    project = res.scalars().first()
    if not project:
         raise HTTPException(status_code=404)
         
    if project.owner_id != current_user.id:
        has_access = await db.execute(
            select(ComponentContributor)
            .join(Component)
            .where(
                Component.project_id == project_id,
                ComponentContributor.user_id == current_user.id
            )
        )
        if not has_access.scalars().first():
             raise HTTPException(status_code=403, detail="Not authorized")
             
    q = select(ChangeRequest).where(ChangeRequest.project_id == project_id)
    if status is not None:
         q = q.where(ChangeRequest.status == status)
    if author_id is not None:
         q = q.where(ChangeRequest.author_id == author_id)
    if component_id is not None:
         q = q.where(ChangeRequest.component_id == component_id)
         
    # Count total
    count_q = select(func.count()).select_from(q.subquery())
    total_res = await db.execute(count_q)
    total = total_res.scalar_one()
    
    # Pagination
    q = q.offset((page - 1) * limit).limit(limit)
    res = await db.execute(q)
    changes = res.scalars().all()
    
    return {
        "data": [
            {
                "id": c.id,
                "title": c.title,
                "status": c.status,
                "author_id": c.author_id,
                "component_id": c.component_id,
                "created_at": c.created_at.isoformat()
            } for c in changes
        ],
        "meta": {
            "total": total,
            "page": page,
            "limit": limit,
            "has_next": (page * limit) < total
        }
    }

@router.get("/changes/{change_id}/impact")
async def get_change_impact(change_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(ChangeRequest).where(ChangeRequest.id == change_id))
    cr = res.scalars().first()
    if not cr:
        raise HTTPException(status_code=404, detail="Change not found")
        
    res_p = await db.execute(select(Project).where(Project.id == cr.project_id))
    project = res_p.scalars().first()
    if project.owner_id != current_user.id:
        # Check if contributor
        has_access = await db.execute(
            select(ComponentContributor)
            .join(Component)
            .where(
                Component.project_id == cr.project_id,
                ComponentContributor.user_id == current_user.id
            )
        )
        if not has_access.scalars().first():
             raise HTTPException(status_code=403, detail="Not authorized")
             
    from sqlalchemy.orm import selectinload
    imp_res = await db.execute(
        select(ChangeImpact)
        .options(
            selectinload(ChangeImpact.component),
            selectinload(ChangeImpact.contributor)
        )
        .where(ChangeImpact.change_request_id == change_id)
    )
    impacts = imp_res.scalars().all()
    
    impact_data = []
    for imp in impacts:
        impact_data.append({
            "id": imp.id,
            "component_id": imp.component_id,
            "component_name": imp.component.name,
            "contributor_id": imp.contributor_id,
            "contributor_name": imp.contributor.display_name,
            "detection_method": imp.detection_method,
            "confidence": imp.confidence,
            "affected_lines": imp.affected_lines,
            "llm_annotation": imp.llm_annotation,
            "acknowledged": imp.acknowledged,
            "dismissed": imp.dismissed
        })
        
    return {
        "data": {
            "change_request_id": cr.id,
            "status": cr.status,
            "impacts": impact_data
        }
    }

@router.post("/changes/{change_id}/acknowledge")
async def acknowledge_impact(change_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    cr_res = await db.execute(select(ChangeRequest).where(ChangeRequest.id == change_id))
    cr = cr_res.scalars().first()
    if not cr:
        raise HTTPException(status_code=404)
        
    imp_res = await db.execute(select(ChangeImpact).where(ChangeImpact.change_request_id == change_id))
    impacts = imp_res.scalars().all()
    
    my_impacts = [i for i in impacts if i.contributor_id == current_user.id]
    if not my_impacts:
         raise HTTPException(status_code=403, detail="You are not a contributor affected by this change")
         
    for i in my_impacts:
        i.acknowledged = True
        i.acknowledged_at = datetime.now(timezone.utc)
        
    await db.flush()
    
    # check if ALL acknowledged
    all_ack = True
    for i in impacts:
        if not i.acknowledged and not i.dismissed:
             all_ack = False
             break
             
    if all_ack:
        cr.status = "pending_review"
        
    await db.commit()
    
    import json
    await publish(
        f"ws:user:{cr.author_id}", json.dumps({
             "event": "change:acknowledged",
             "data": {"change_request_id": change_id}
        })
    )
    
    return {"data": {"acknowledged": True, "acknowledged_at": my_impacts[0].acknowledged_at.isoformat()}}

@router.post("/changes/{change_id}/approve")
async def approve_change(change_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    cr_res = await db.execute(select(ChangeRequest).where(ChangeRequest.id == change_id))
    cr = cr_res.scalars().first()
    if not cr:
        raise HTTPException(status_code=404)
        
    p_res = await db.execute(select(Project).where(Project.id == cr.project_id))
    proj = p_res.scalars().first()
    
    if proj.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only project owner can approve changes")
        
    # strictness mode (stub logic based on prompt)
    # Check if all impacts are acknowledged
    imp_res = await db.execute(select(ChangeImpact).where(ChangeImpact.change_request_id == change_id))
    impacts = imp_res.scalars().all()
    all_ack = all(i.acknowledged or i.dismissed for i in impacts)
    
    # if strict mode (assuming boolean field like 'strict_mode' or just generic requirement):
    # Here we simulate strict mode check if requested by prompt "Check strictness mode... if full"
    # Actually component strictness or project strictness? Prompt says "Check strictness mode - if full: verify all impacts are acknowledged"
    # Since we didn't add strictness mode field natively in migrations, let's just forcefully verify.
    # We will assume proj.strictness_mode doesn't technically exist in our DB model based on earlier logs, or let's use the all_ack flag.
    # wait, earlier migration had `strictness_mode`? (Ah yes, Step 35 "strictness_mode, color, icon"). Let's assume it exists or use generic `hasattr`.
    
    strict_mode = getattr(proj, "strictness_mode", "full")
    if strict_mode == "full" and not all_ack:
         raise HTTPException(status_code=422, detail="All impacts must be acknowledged before approval")
         
    # Create AFTER snapshot
    snap2 = ProjectSnapshot(
        project_id=cr.project_id,
        created_by=current_user.id,
        change_request_id=cr.id
    )
    db.add(snap2)
    await db.flush()
    
    # write draft to S3 "permanently"
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
    
    from app.core.storage import upload_bytes
    import uuid
    for d in drafts:
        f_res = await db.execute(select(ProjectFile).where(ProjectFile.id == d.file_id))
        f = f_res.scalars().first()
        if not f:
            continue
        
        import os
        _, ext = os.path.splitext(f.path)
        ext = ext or ".txt"
        new_key = f"projects/{cr.project_id}/files/{f.id}/v{uuid.uuid4().hex[:8]}{ext}"
        b_content = (d.content or "").encode('utf8')
        await upload_bytes(new_key, b_content, "text/plain")
        
        f.s3_key = new_key
        d.is_active = False
        
    await db.flush()
    
    # populate AFTER snapshot_files
    f_res_all = await db.execute(select(ProjectFile).where(ProjectFile.project_id == cr.project_id))
    all_files = f_res_all.scalars().all()
    for af in all_files:
        db.add(SnapshotFile(
            snapshot_id=snap2.id,
            file_id=af.id,
            s3_key=af.s3_key
        ))
        
    cr.status = "approved"
    cr.resolved_at = datetime.now(timezone.utc)
    
    # update components back to stable 
    affected_cids = {imp.component_id for imp in impacts}
    if cr.component_id:
        affected_cids.add(cr.component_id)
        
    for cid in affected_cids:
       await db.execute(update(Component).where(Component.id == cid).values(status="stable"))
       
    await db.commit()
    
    import json
    # publish to ALL contributors of project
    all_cb_res = await db.execute(
        select(ComponentContributor)
        .join(Component)
        .where(Component.project_id == cr.project_id)
    )
    all_cbs = all_cb_res.scalars().all()
    uids = {cb.user_id for cb in all_cbs}
    uids.add(proj.owner_id)
    
    for uid in uids:
        await publish(
            f"ws:user:{uid}", json.dumps({
                "event": "change:approved",
                "data": {"change_request_id": change_id}
            })
        )
        
    return {"data": {"status": "approved", "resolved_at": cr.resolved_at.isoformat()}}

@router.post("/changes/{change_id}/impact/{component_id}/dismiss")
async def dismiss_impact(change_id: str, component_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(
        select(ChangeImpact)
        .where(
            ChangeImpact.change_request_id == change_id,
            ChangeImpact.component_id == component_id
        )
    )
    imp = res.scalars().first()
    if not imp:
         raise HTTPException(status_code=404, detail="Impact not found")
         
    if imp.contributor_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not authorized to dismiss this impact")
         
    if imp.detection_method == "parser":
         raise HTTPException(status_code=400, detail="Cannot dismiss parser detection")
         
    imp.dismissed = True
    await db.commit()
    return {"data": {"dismissed": True}}

@router.get("/changes")
async def list_global_changes(scope: str = Query("mine"), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if scope not in ["mine", "affected"]:
        raise HTTPException(status_code=400, detail="Scope not supported")
        
    if scope == "mine":
        my_res = await db.execute(select(ChangeRequest).where(ChangeRequest.author_id == current_user.id))
        changes = my_res.scalars().all()
    else:  # affected
        act_res = await db.execute(
            select(ChangeImpact.change_request_id)
            .where(
                ChangeImpact.contributor_id == current_user.id,
                ChangeImpact.acknowledged == False,
                ChangeImpact.dismissed == False
            )
        )
        needs_action_ids = set(act_res.scalars().all())
        changes = []
        if needs_action_ids:
            res2 = await db.execute(select(ChangeRequest).where(ChangeRequest.id.in_(needs_action_ids)))
            changes = res2.scalars().all()
            
    return {"data": [
        {
            "id": c.id, 
            "title": c.title, 
            "status": c.status,
            "project_id": c.project_id,
            "component_id": c.component_id,
            "author_id": c.author_id,
            "created_at": c.created_at.isoformat() if c.created_at else None
        } 
        for c in changes
    ]}
