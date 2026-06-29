# Project package for PCCraft Marketplace.

# Importing the celery app here ensures every process (Django runserver,
# manage.py shell, wsgi workers, beat) registers config.celery_app as
# Celery's default app. Without this, @shared_task binds to a fresh,
# anonymous Celery() instance that defaults to broker "localhost:5672"
# (RabbitMQ). When a Django web process then calls .delay(), kombu tries
# to reach localhost:5672 and fails with ConnectionRefusedError -- which
# is exactly what we kept seeing even after configuring Redis in settings.
from .celery import celery_app as celery_app  # noqa: F401