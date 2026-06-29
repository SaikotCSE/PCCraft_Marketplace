"""Celery application bootstrap.

Every module imports ``celery_app`` from this file so that
``@shared_task`` decorations get registered automatically.
"""
"""Celery application bootstrap.

Every module imports ``celery_app`` from this file so that
``@shared_task`` decorations get registered automatically.
"""
import os
from pathlib import Path

from celery import Celery
from decouple import config as _decouple_config

# Boot .env BEFORE constructing Celery. Kombu resolves CELERY_BROKER_URL
# at construction time, and that setting is computed from REDIS_URL in
# settings.base — which only sees REDIS_URL after python-decouple has
# loaded the .env file. Without this, kombu falls back to its default
# `localhost:5672` (RabbitMQ) and the worker's .delay() calls raise
# ConnectionRefusedError.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

celery_app = Celery(
    "pccraft",
    broker=_decouple_config("REDIS_URL", default="redis://127.0.0.1:6379/0"),
    backend=_decouple_config("REDIS_URL", default="redis://127.0.0.1:6379/0"),
)
celery_app.config_from_object("django.conf:settings", namespace="CELERY")
celery_app.autodiscover_tasks()