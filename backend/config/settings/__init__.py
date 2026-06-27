"""
Settings package entry-point.

Selects the active settings module based on the ``DJANGO_ENV`` env var
(defaulting to ``development``). Production deployments must set
``DJANGO_ENV=production``; everything else inherits the development
configuration.
"""
import os

from decouple import config as _decouple_config

ENV = _decouple_config("DJANGO_ENV", default="development")

if ENV == "production":
    from .production import *  # noqa: F401,F403
else:
    from .development import *  # noqa: F401,F403

# Expose the resolved env name so other modules can branch on it.
os.environ.setdefault("DJANGO_ENV", ENV)