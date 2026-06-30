"""Test-only settings.

Used via the ``DJANGO_SETTINGS_MODULE=config.settings.test`` env var.
Switches:

* Database → in-memory SQLite (no Postgres / Docker needed for CI).
* Email backend → ``locmem`` so password-reset / OTP flows don't hit SMTP.
* Throttling → disabled so rate limits don't interfere with parallel tests.
"""
from .base import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

REST_FRAMEWORK = dict(REST_FRAMEWORK)  # type: ignore[var-annotated]
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Cache for things like throttling / permissions that touch cache.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test",
    }
}

# Quieter logging during the test run.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"null": {"class": "logging.NullHandler"}},
    "root": {"handlers": ["null"], "level": "WARNING"},
}
