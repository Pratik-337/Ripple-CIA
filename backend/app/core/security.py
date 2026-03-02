from datetime import datetime, timedelta, timezone
import secrets
import hashlib

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import bcrypt
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User

from app.core.config import settings

ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")

def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password=pwd_bytes, salt=salt)
    return hashed_password.decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    password_byte_enc = plain.encode('utf-8')
    hashed_password = hashed.encode('utf-8')
    return bcrypt.checkpw(password=password_byte_enc, hashed_password=hashed_password)


def _parse_jwt_expires_in(value: str) -> int:
    """Parse jwt_expires_in setting to minutes. Supports formats like '30m', '1h', '1d'."""
    value = value.strip().lower()
    if value.endswith("m"):
        return int(value[:-1])
    elif value.endswith("h"):
        return int(value[:-1]) * 60
    elif value.endswith("d"):
        return int(value[:-1]) * 60 * 24
    elif value.endswith("minutes"):
        return int(value.replace("minutes", "").strip())
    elif value.endswith("hours"):
        return int(value.replace("hours", "").strip()) * 60
    elif value.endswith("days"):
        return int(value.replace("days", "").strip()) * 60 * 24
    else:
        # Default fallback: treat as minutes
        return int(value)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    minutes = _parse_jwt_expires_in(settings.jwt_expires_in)
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    
    to_encode.update({
        "exp": expire,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    })
    
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token() -> tuple[str, str]:
    """Returns (raw_token, hashed_token). Store the hash, give the raw to client."""
    raw = secrets.token_hex(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def verify_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token, 
            settings.jwt_secret, 
            algorithms=[ALGORITHM],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = verify_access_token(token)
    user_id: str | None = payload.get("userId")
    if user_id is None:
        raise credentials_exception
        
    user = await db.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user


