import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.database import get_db
import app.core.redis as redis_core
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models.user import RefreshToken, User
from app.models.change import Invite
from app.models.component import ComponentContributor

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    new_user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
        display_name=req.display_name,
        role="user",
        is_verified=False,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Step 83: auto-accept invites
    invites_res = await db.execute(select(Invite).where(Invite.invited_email == req.email, Invite.status == "pending"))
    invites = invites_res.scalars().all()
    for invite in invites:
        invite.status = "accepted"
        if invite.component_id:
            cc = ComponentContributor(
                component_id=invite.component_id,
                user_id=new_user.id,
                role=invite.role,
                granted_at=datetime.now(timezone.utc),
                granted_by=invite.invited_by,
            )
            db.add(cc)
    
    if invites:
        await db.commit()

    # Generate access token so the frontend can auto-login after registration
    access_token = create_access_token({"userId": new_user.id, "email": new_user.email, "role": new_user.role})

    return {
        "data": {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": new_user.id,
                "email": new_user.email,
                "display_name": new_user.display_name,
                "avatar_url": new_user.avatar_url,
            }
        },
        "message": "Registration successful"
    }

@router.post("/login")
async def login(req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        
    if not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token({"userId": user.id, "email": user.email, "role": user.role})
    raw_rt, hashed_rt = create_refresh_token()
    
    rt_record = RefreshToken(
        user_id=user.id,
        token_hash=hashed_rt,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        revoked=False,
    )
    db.add(rt_record)
    await db.commit()
    
    response.set_cookie(
        "refresh_token", raw_rt, httponly=True, samesite="lax", path="/api/v1/auth", max_age=604800
    )
    
    return {
        "data": {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
            }
        }
    }

@router.get("/me")
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    raw_rt = request.cookies.get("refresh_token")
    if not raw_rt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        
    hashed_rt = hash_refresh_token(raw_rt)
    
    stmt = select(RefreshToken).where(
        RefreshToken.token_hash == hashed_rt,
        RefreshToken.revoked == False,
        RefreshToken.expires_at > datetime.now(timezone.utc)
    )
    result = await db.execute(stmt)
    rt = result.scalar_one_or_none()
    
    if not rt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
        
    user_res = await db.execute(select(User).where(User.id == rt.user_id))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        
    access_token = create_access_token({"userId": user.id, "email": user.email, "role": user.role})
    
    return {
        "data": {
            "access_token": access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
            }
        }
    }

@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    raw_rt = request.cookies.get("refresh_token")
    if raw_rt:
        hashed_rt = hash_refresh_token(raw_rt)
        result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hashed_rt))
        rt = result.scalar_one_or_none()
        if rt:
            rt.revoked = True
            await db.commit()
            
    response.delete_cookie("refresh_token", path="/api/v1/auth")
    return {"data": None, "message": "Logged out"}

@router.get("/github")
async def github_login():
    state = secrets.token_urlsafe(16)
    r = await redis_core.get_redis()
    await r.setex(f"github_state:{state}", 600, "1")
    
    url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={settings.github_redirect_uri}"
        f"&scope=repo,user:email"
        f"&state={state}"
    )
    return RedirectResponse(url)

@router.get("/github/callback")
async def github_callback(state: str, code: str, response: Response, db: AsyncSession = Depends(get_db)):
    r = await redis_core.get_redis()
    is_valid = await r.get(f"github_state:{state}")
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid state parameter")
        
    await r.delete(f"github_state:{state}")
    
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_redirect_uri,
            },
            headers={"Accept": "application/json"}
        )
        token_data = token_res.json()
        if "error" in token_data:
            raise HTTPException(status_code=400, detail=token_data["error_description"])
            
        access_token = token_data["access_token"]
        
        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        gh_user = user_res.json()
        
        gh_email = gh_user.get("email")
        if not gh_email:
            emails_res = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            emails = emails_res.json()
            primary = next((e for e in emails if e.get("primary")), None)
            if primary:
                gh_email = primary["email"]
            elif emails:
                gh_email = emails[0]["email"]
                
        if not gh_email:
            raise HTTPException(status_code=400, detail="Could not retrieve email from GitHub")
            
        # Upsert
        result = await db.execute(select(User).where(User.github_id == str(gh_user["id"])))
        user = result.scalar_one_or_none()
        
        if not user:
            result = await db.execute(select(User).where(User.email == gh_email))
            user = result.scalar_one_or_none()
            
        if user:
            user.github_id = str(gh_user["id"])
            user.github_access_token = access_token
            if gh_user.get("avatar_url"):
                user.avatar_url = gh_user["avatar_url"]
        else:
            user = User(
                email=gh_email,
                github_id=str(gh_user["id"]),
                github_access_token=access_token,
                display_name=gh_user.get("name") or gh_user.get("login"),
                avatar_url=gh_user.get("avatar_url"),
                is_verified=True,
            )
            db.add(user)
            await db.flush()
            
            invites_res = await db.execute(select(Invite).where(Invite.invited_email == gh_email, Invite.status == "pending"))
            for invite in invites_res.scalars().all():
                invite.status = "accepted"
                if invite.component_id:
                    db.add(ComponentContributor(
                        component_id=invite.component_id,
                        user_id=user.id,
                        role=invite.role,
                        granted_at=datetime.now(timezone.utc),
                        granted_by=invite.invited_by,
                    ))
                    
        await db.commit()
        await db.refresh(user)
        
        raw_rt, hashed_rt = create_refresh_token()
        db.add(RefreshToken(
            user_id=user.id,
            token_hash=hashed_rt,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        ))
        await db.commit()
        
        response.set_cookie(
            "refresh_token", raw_rt, httponly=True, samesite="lax", path="/api/v1/auth", max_age=604800
        )
        
        frontend_url = settings.allowed_origins.split(",")[0].strip()
        return RedirectResponse(f"{frontend_url}/auth/callback")
