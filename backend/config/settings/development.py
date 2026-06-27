"""
Development settings.

- DEBUG on, console email backend, permissive CORS.
- Local filesystem media + static served by Django itself.
"""
from .base import *  # noqa: F401,F403

DEBUG = True

# Serve uploaded media directly from Django's dev server.
from django.conf import settings  # noqa: E402

if not settings.configured:  # pragma: no cover -- defensive import-order guard
    pass