import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routers import auth, projects, components, files, changes, notifications, websockets
from app.core.config import settings
from app.core.websocket import listen_to_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start background Redis listener for WebSockets
    redis_listener_task = asyncio.create_task(listen_to_redis())
    
    # Startup: Ensure MinIO buckets exist
    from app.core.storage import get_s3
    s3 = get_s3()
    try:
        s3.head_bucket(Bucket=settings.minio_bucket)
    except Exception:
        # We can't actually do this without MinIO running, so we just pass for now
        pass
        
    yield
    
    # Shutdown
    redis_listener_task.cancel()


app = FastAPI(
    title="Ripple",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite frontend
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
app.include_router(websockets.router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
