from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.component import ComponentContributor, Component
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me")
async def get_current_user_profile(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get current user's profile."""
    return {
        "data": {
            "id": current_user.id,
            "email": current_user.email,
            "display_name": current_user.display_name,
            "avatar_url": current_user.avatar_url,
        }
    }

@router.patch("/me")
async def update_current_user_profile(
    display_name: str | None = None,
    avatar_url: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update current user's profile."""
    if display_name is not None:
        current_user.display_name = display_name
    if avatar_url is not None:
        current_user.avatar_url = avatar_url
    
    await db.commit()
    await db.refresh(current_user)
    
    return {
        "data": {
            "id": current_user.id,
            "email": current_user.email,
            "display_name": current_user.display_name,
            "avatar_url": current_user.avatar_url,
        }
    }

@router.get("/search")
async def search_users(q: str = Query(..., min_length=2), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = (
        select(User)
        .where(
            User.id != current_user.id,
            or_(
                User.display_name.ilike(f"%{q}%"),
                User.email.ilike(f"%{q}%")
            )
        )
        .limit(10)
    )
    res = await db.execute(query)
    users = res.scalars().all()
    
    return {
        "data": [
            {
                "id": u.id,
                "display_name": u.display_name,
                "email": u.email,
                "avatar_url": u.avatar_url
            }
            for u in users
        ]
    }

@router.get("/collaborators")
async def list_collaborators(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Find all projects where current user is owner or contributor
    owned_res = await db.execute(select(Project).where(Project.owner_id == current_user.id))
    owned_projects = owned_res.scalars().all()
    project_ids = {p.id for p in owned_projects}
    
    contrib_res = await db.execute(
        select(Component.project_id)
        .join(ComponentContributor)
        .where(ComponentContributor.user_id == current_user.id)
    )
    for row in contrib_res.all():
         project_ids.add(row.project_id)
         
    if not project_ids:
         return {"data": []}
         
    cb_users_res = await db.execute(
        select(ComponentContributor.user_id, Project.name, ComponentContributor.granted_at)
        .join(Component, Component.id == ComponentContributor.component_id)
        .join(Project, Project.id == Component.project_id)
        .where(Project.id.in_(project_ids))
    )
    cbs = cb_users_res.all()
    
    collaborators_map = {}
    for user_id, project_name, granted_at in cbs:
        if user_id == current_user.id:
            continue
            
        if user_id not in collaborators_map:
            collaborators_map[user_id] = {
                "shared_projects": set(),
                "last_activity": granted_at
            }
        
        collaborators_map[user_id]["shared_projects"].add(project_name)
        # simplistic last activity
        if granted_at > collaborators_map[user_id]["last_activity"]:
            collaborators_map[user_id]["last_activity"] = granted_at

    users_res = await db.execute(select(User).where(User.id.in_(list(collaborators_map.keys()))))
    users_data = users_res.scalars().all()
    
    out = []
    for u in users_data:
        m = collaborators_map[u.id]
        out.append({
            "id": u.id,
            "display_name": u.display_name,
            "email": u.email,
            "avatar_url": u.avatar_url,
            "shared_projects": list(m["shared_projects"]),
            "last_activity": m["last_activity"].isoformat()
        })
        
    return {"data": out}
