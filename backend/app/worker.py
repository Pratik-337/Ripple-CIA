import os
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "ripple",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.parsing", "app.tasks.impact", "app.tasks.autoconfirm"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    # Use solo pool for Windows compatibility (billiard multiprocessing issues)
    worker_pool="solo",
    beat_schedule={
        "auto-confirm-stale-impacts": {
            "task": "app.tasks.autoconfirm.auto_confirm_stale_impacts",
            "schedule": 3600.0,
        }
    }
)
