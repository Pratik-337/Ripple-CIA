import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

import app.core.redis as redis_core
from app.core.config import settings
from app.models.component import Component, ComponentContributor

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # Map user_id to a list of their active WebSocket connections
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"User {user_id} connected. Total conns for user: {len(self.active_connections[user_id])}")

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        if user_id in self.active_connections:
            try:
                self.active_connections[user_id].remove(websocket)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
            except ValueError:
                pass
        logger.info(f"User {user_id} disconnected.")

    async def send_to_user(self, user_id: str, event: str, data: dict) -> None:
        if user_id not in self.active_connections:
            return
        
        message = {"event": event, "data": data}
        dead_connections = []
        
        for connection in self.active_connections[user_id]:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)
                
        for dead in dead_connections:
            await self.disconnect(user_id, dead)

    async def broadcast_to_project(self, project_id: str, event: str, data: dict, db: AsyncSession) -> None:
        stmt = select(ComponentContributor.user_id).join(Component).where(Component.project_id == project_id)
        result = await db.execute(stmt)
        user_ids = set(row[0] for row in result.all())
        
        for user_id in user_ids:
            await self.send_to_user(user_id, event, data)

manager = ConnectionManager()

async def redis_listener(manager: ConnectionManager) -> None:
    redis_client = await redis_core.get_redis()
    pubsub = redis_client.pubsub()
    
    await pubsub.psubscribe("ws:*")
    
    logger.info("Started Redis WebSocket event listener.")
    
    try:
        async for message in pubsub.listen():
            if message["type"] == "pmessage":
                try:
                    channel = message["channel"]
                    # Channel format is "ws:user:{user_id}" — extract the last segment
                    parts = channel.split(":")
                    user_id = parts[-1] if len(parts) >= 3 else parts[1] if len(parts) >= 2 else None
                    payload = json.loads(message["data"])
                    event_type = payload.get("event")
                    data = payload.get("data", {})
                    
                    if user_id and event_type:
                        await manager.send_to_user(user_id, event_type, data)
                except Exception as e:
                    logger.error(f"Error processing Redis WS message: {e}")
    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.punsubscribe("ws:*")
