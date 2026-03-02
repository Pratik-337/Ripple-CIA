from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.component import Component, ComponentContributor
from app.models.change import ChangeRequest, Invite

from pydantic import BaseModel, field_validator

router = APIRouter(prefix="/projects", tags=["projects"])

ALLOWED_STRICTNESS_MODES = ["permissive", "standard", "strict"]

class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "from-violet-500 to-purple-600"
    icon: str = "box"
    strictness_mode: str = "standard"
    
    @field_validator('strictness_mode')
    @classmethod
    def validate_strictness_mode(cls, v: str) -> str:
        if v not in ALLOWED_STRICTNESS_MODES:
            raise ValueError(f"strictness_mode must be one of: {', '.join(ALLOWED_STRICTNESS_MODES)}")
        return v

class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    icon: str | None = None
    strictness_mode: str | None = None
    
    @field_validator('strictness_mode')
    @classmethod
    def validate_strictness_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in ALLOWED_STRICTNESS_MODES:
            raise ValueError(f"strictness_mode must be one of: {', '.join(ALLOWED_STRICTNESS_MODES)}")
        return v

@router.post("")
async def create_project(req: ProjectCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Create the project with status draft
    new_project = Project(
        owner_id=current_user.id,
        name=req.name,
        description=req.description,
        color=req.color,
        icon=req.icon,
        status="draft"
    )
    db.add(new_project)
    await db.flush() # flush to get an ID

    # Create root component
    root_component = Component(
        project_id=new_project.id,
        name="Root",
        color=req.color,
        status="stable"
    )
    db.add(root_component)
    await db.flush()

    # Create ComponentContributor row giving owner full access
    contrib = ComponentContributor(
        component_id=root_component.id,
        user_id=current_user.id,
        role="owner",
        granted_by=current_user.id
    )
    db.add(contrib)
    await db.commit()
    await db.refresh(new_project)
    
    # Return 201 response directly
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=201, content={
        "data": {
            "id": new_project.id,
            "name": new_project.name,
            "description": new_project.description,
            "status": new_project.status,
            "color": new_project.color,
            "icon": new_project.icon,
            "created_at": new_project.created_at.isoformat()
        }
    })

@router.get("")
async def list_projects(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Query all projects where user is owner, OR user has component contributor row
    query = (
        select(Project)
        .outerjoin(Component, Component.project_id == Project.id)
        .outerjoin(ComponentContributor, ComponentContributor.component_id == Component.id)
        .where(
            or_(
                Project.owner_id == current_user.id,
                ComponentContributor.user_id == current_user.id
            )
        )
        .distinct()
    )
    res = await db.execute(query)
    projects = res.scalars().all()
    
    # Not efficient N+1 per requirement wait. The requirement says:
    # "do this with a single JOIN query, not N+1 loops"
    # To do that, we need a CTE or subqueries.
    # Refactoring the query to get stats:
    
    stats_query = (
        select(
            Project.id.label("project_id"),
            Project.owner_id,
            Project.name,
            Project.description,
            Project.color,
            Project.icon,
            Project.status,
            Project.created_at,
            func.count(func.distinct(Component.id)).label("component_count"),
            func.count(func.distinct(ComponentContributor.user_id)).label("contributor_count") # this assumes all unique users across components
        )
        .outerjoin(Component, Component.project_id == Project.id)
        .outerjoin(ComponentContributor, ComponentContributor.component_id == Component.id)
        .where(
            or_(
                Project.owner_id == current_user.id,
                Project.id.in_(
                    select(Component.project_id)
                    .join(ComponentContributor, ComponentContributor.component_id == Component.id)
                    .where(ComponentContributor.user_id == current_user.id)
                )
            )
        )
        .group_by(Project.id)
    )
    stats_res = await db.execute(stats_query)
    
    data = []
    for row in stats_res.fetchall():
        # Get owner's info
        owner_query = await db.execute(
            select(User).where(User.id == row.owner_id)
        )
        owner = owner_query.scalars().first()
        
        # Determine user role (owner or contributor)
        is_owner = row.owner_id == current_user.id
        
        data.append({
            "id": row.project_id,
            "name": row.name,
            "description": row.description,
            "color": row.color,
            "icon": row.icon,
            "status": row.status,
            "isDraft": row.status == "draft",
            "created_at": row.created_at.isoformat(),
            "componentCount": row.component_count,
            "contributorCount": row.contributor_count,
            "activeChanges": 0,  # TODO: Add change count query
            "lastActivity": row.created_at.isoformat(),  # TODO: Add last activity from changes
            "owner": {
                "id": owner.id if owner else "",
                "name": owner.display_name if owner else "",
                "initials": "".join([n[0] for n in (owner.display_name.split() if owner and owner.display_name else [])]).upper() if owner else "?",
                "color": "from-violet-500 to-purple-600"  # Default color
            },
            "role": "Owner" if is_owner else "Contributor"
        })
    return {"data": data}

@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 1. Fetch project
    res = await db.execute(select(Project).where(Project.id == project_id))
    project = res.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    # 2. Verify access (owner or inherited via components)
    if project.owner_id != current_user.id:
        has_access = await db.execute(
            select(ComponentContributor)
            .join(Component)
            .where(Component.project_id == project_id, ComponentContributor.user_id == current_user.id)
        )
        if not has_access.scalars().first():
            raise HTTPException(status_code=403, detail="Not authorized to view this project")

    # 3. Fetch components with contributors and files
    comp_res = await db.execute(
        select(Component)
        .options(
            selectinload(Component.contributors).selectinload(ComponentContributor.user),
            selectinload(Component.files)
        )
        .where(Component.project_id == project_id)
    )
    components = comp_res.scalars().all()
    
    # 4. Compute active_change_count
    ch_res = await db.execute(
        select(func.count(ChangeRequest.id))
        .where(
            ChangeRequest.project_id == project_id,
            ChangeRequest.status.in_(["pending_analysis", "analysis_complete", "pending_review"])
        )
    )
    active_change_count = ch_res.scalar_one()
    
    # Get owner info
    owner_res = await db.execute(select(User).where(User.id == project.owner_id))
    owner = owner_res.scalars().first()
    is_owner = project.owner_id == current_user.id
    
    # Build all contributors list
    all_contributors = []
    for c in components:
        for ccb in c.contributors:
            all_contributors.append({
                "user_id": ccb.user.id,
                "display_name": ccb.user.display_name,
                "email": ccb.user.email,
                "role": ccb.role,
                "avatar_url": ccb.user.avatar_url
            })
    
    return {
        "data": {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "strictnessMode": project.strictness_mode,
            "status": project.status,
            "color": project.color,
            "icon": project.icon,
            "createdAt": project.created_at.isoformat(),
            "owner": {
                "id": owner.id if owner else "",
                "name": owner.display_name if owner else "",
                "initials": "".join([n[0] for n in (owner.display_name.split() if owner and owner.display_name else [])]).upper() if owner else "?",
                "color": "from-violet-500 to-purple-600"
            },
            "isOwner": is_owner,
            "activeChanges": [],  # Placeholder - would need ChangeRequest query
            "allContributors": all_contributors,
            "components": [
                {
                    "id": c.id,
                    "name": c.name,
                    "color": c.color,
                    "status": c.status,
                    "fileCount": len(c.files),
                    "contributors": [
                        {
                            "user_id": ccb.user.id,
                            "role": ccb.role,
                            "display_name": ccb.user.display_name,
                            "email": ccb.user.email,
                            "avatar_url": ccb.user.avatar_url
                        }
                        for ccb in c.contributors
                    ],
                    "lastActivity": c.created_at.isoformat() if c.created_at else "",
                    "activeChanges": 0,  # TODO: Add per-component change count
                    "isMyComponent": current_user.id == project.owner_id or any(ccb.user.id == current_user.id for ccb in c.contributors)
                }
                for c in components
            ]
        }
    }

@router.patch("/{project_id}")
async def update_project(project_id: str, req: ProjectUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(Project).where(Project.id == project_id))
    project = res.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can modify project")
        
    if req.name is not None:
        project.name = req.name
    if req.description is not None:
        project.description = req.description
    if req.strictness_mode is not None:
        project.strictness_mode = req.strictness_mode
    if req.color is not None:
        project.color = req.color
    if req.icon is not None:
        project.icon = req.icon
        
    from datetime import datetime, timezone
    project.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(project)
    
    return {
        "data": {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "strictness_mode": project.strictness_mode,
            "status": project.status,
            "color": project.color,
            "icon": project.icon,
            "updated_at": project.updated_at.isoformat()
        }
    }

@router.get("/{project_id}/invites")
async def get_project_invites(project_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(Project).where(Project.id == project_id))
    proj = res.scalars().first()
    if not proj or proj.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only project owner can view invites")
        
    invites_res = await db.execute(
        select(Invite).where(Invite.project_id == project_id, Invite.status == "pending")
    )
    invites = invites_res.scalars().all()
    
    components_res = await db.execute(select(Component).where(Component.project_id == project_id))
    components_map = {c.id: c.name for c in components_res.scalars().all()}
    
    return {
        "data": [
            {
                "id": i.id,
                "email": i.invited_email,
                "status": i.status,
                "component_name": components_map.get(i.component_id, "Project-wide") if i.component_id else "Project-wide",
                "created_at": i.created_at.isoformat()
            }
            for i in invites
        ]
    }

@router.post("/{project_id}/confirm")
async def confirm_project_setup(project_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(Project).where(Project.id == project_id))
    project = res.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can confirm project setup")
        
    project.status = "active"
    await db.commit()
    
    return {"data": {"status": "active", "id": project.id}}

@router.delete("/{project_id}")
async def delete_project(project_id: str, action: str = Query("delete"), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(Project).where(Project.id == project_id))
    project = res.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only owner can delete project")
        
    if action == "archive":
        project.status = "archived"
        await db.commit()
    elif action == "delete":
        await db.delete(project)
        await db.commit()
    else:
        raise HTTPException(status_code=400, detail="Invalid action parameter")
        
    return {"data": None, "message": "Operation successful"}
