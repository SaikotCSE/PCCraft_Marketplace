"""Celery application bootstrap.

Every module imports ``celery_app`` from this file so that
``@shared_task`` decorations get registered automatically.
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

celery_app = Celery("pccraft")
celery_app.config_from_object("django.conf:settings", namespace="CELERY")
celery_app.autodiscover_tasks()