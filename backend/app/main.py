import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routers import auth, projects, components, files, changes, notifications, users
from app.core.config import settings
from app.core.websocket import manager, redis_listener
from app.core.storage import ensure_bucket_exists
from app.core.security import verify_access_token


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_bucket_exists()
    
    from app.core.redis import init_redis, close_redis
    await init_redis()
    
    redis_listener_task = asyncio.create_task(redis_listener(manager))
    yield
    redis_listener_task.cancel()
    await close_redis()


app = FastAPI(
    title="Ripple",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(components.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(changes.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")


@app.websocket("/api/v1/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str):
    await websocket.accept()
    try:
        verify_access_token(token)
    except Exception:
        await websocket.close(code=4001)
        return

    await manager.connect(user_id, websocket)
    
    heartbeat_task = None
    
    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(30)
                await websocket.send_json({"event": "ping"})
        except Exception:
            pass

    try:
        heartbeat_task = asyncio.create_task(heartbeat())
        while True:
            data = await websocket.receive_json()
            if data.get("event") == "reconnect":
                # Handle reconnect logic by replaying missed notifications
                pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if heartbeat_task:
            heartbeat_task.cancel()
        await manager.disconnect(user_id, websocket)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
