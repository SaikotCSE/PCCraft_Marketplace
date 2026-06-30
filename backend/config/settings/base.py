"""
Base Django settings shared by every deployment environment.

Environment-specific overrides live in ``development.py`` and
``production.py``. Keep this file declarative and side-effect free -- it
should be safe to import from management commands and Celery workers.
"""
from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

# ─────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ─────────────────────────────────────────────────────────────────
# Security
# ─────────────────────────────────────────────────────────────────
SECRET_KEY = config(
    "DJANGO_SECRET_KEY",
    default="dev-insecure-secret-key-change-me-in-production",
)
DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

# ─────────────────────────────────────────────────────────────────
# Apps & middleware
# ─────────────────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",  # full-text search (Postgres-only; safe in dev too)
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "storages",
]

LOCAL_APPS = [
    "apps.common.apps.CommonConfig",
    "apps.accounts.apps.AccountsConfig",
    "apps.categories.apps.CategoriesConfig",
    "apps.brands.apps.BrandsConfig",
    "apps.products.apps.ProductsConfig",
    "apps.cart.apps.CartConfig",
    "apps.wishlist.apps.WishlistConfig",
    "apps.orders.apps.OrdersConfig",
    "apps.reviews.apps.ReviewsConfig",
    "apps.recommendations.apps.RecommendationsConfig",
    "apps.compatibility.apps.CompatibilityConfig",
    "apps.dashboard.apps.DashboardConfig",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.common.security.SecurityHeadersMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ─────────────────────────────────────────────────────────────────
# Database -- PostgreSQL 18+ is the only supported engine.
# ─────────────────────────────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME", default="pccraft"),
        "USER": config("DB_USER", default="pccraft"),
        "PASSWORD": config("DB_PASSWORD", default="pccraft"),
        "HOST": config("DB_HOST", default="127.0.0.1"),
        "PORT": config("DB_PORT", default="5432"),
        "CONN_MAX_AGE": 60,
        "OPTIONS": {
            "connect_timeout": 5,
        },
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─────────────────────────────────────────────────────────────────
# Custom user model (MUST be set before any migration runs)
# ─────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.CustomUser"

# ─────────────────────────────────────────────────────────────────
# Password validation
# ─────────────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ─────────────────────────────────────────────────────────────────
# Internationalisation
# ─────────────────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Dhaka"
USE_I18N = True
USE_TZ = True

# ─────────────────────────────────────────────────────────────────
# Static & media
# ─────────────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# When MEDIA_URL is mounted by the dev server we expose files via urls.py.
STATICFILES_DIRS = [BASE_DIR / "static"]

# ─────────────────────────────────────────────────────────────────
# DRF, JWT, OpenAPI
# ─────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardResultsPagination",
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
    ),
    "DEFAULT_PARSER_CLASSES": (
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ),
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
        # Spec Module 12 overrides: auth endpoints get tighter limits
        # via ``LoginRateThrottle`` and ``RegisterRateThrottle``.
        "login": "30/hour",
        "register": "10/hour",
    },
    "DEFAULT_SCHEMA_CLASS": "apps.common.schema.EnvelopeAutoSchema",
    "DEFAULT_PARSER_CONTEXT": {"request": None},
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "TOKEN_OBTAIN_SERIALIZER": "apps.accounts.serializers.LoginSerializer",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "PCCraft Marketplace API",
    "DESCRIPTION": (
        "REST API for the PCCraft Marketplace platform -- multi-vendor "
        "PC components e-commerce with recommendations and a data-driven "
        "compatibility engine."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "SWAGGER_UI_DIST": "CDN",
    "SWAGGER_UI_FAVICON_HREF": "CDN",
    "REDOC_DIST": "CDN",
}

# ─────────────────────────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173,http://127.0.0.1:5173",
    cast=Csv(),
)
CORS_ALLOW_CREDENTIALS = True

# ─────────────────────────────────────────────────────────────────
# Celery + Redis
# ─────────────────────────────────────────────────────────────────
REDIS_URL = config("REDIS_URL", default="redis://127.0.0.1:6379/0")

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_TIME_LIMIT = 5 * 60
CELERY_TASK_SOFT_TIME_LIMIT = 60 * 60
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler" if False else None

# Celery beat schedule -- Module 7 (recommendations).
CELERY_BEAT_SCHEDULE = {
    "warm-trending-cache": {
        "task": "apps.recommendations.warm_trending_cache",
        # Every 15 minutes, per spec §7.4.
        "schedule": 15 * 60,
    },
    "warm-co-occurrence-cache": {
        "task": "apps.recommendations.warm_co_occurrence_cache",
        # Every 30 minutes -- co-occurrence is cheaper than personalized
        # but still the second-most expensive feed.
        "schedule": 30 * 60,
    },
    "warm-all-personalized": {
        "task": "apps.recommendations.warm_all_personalized",
        # Nightly 03:00 UTC for the top 100 most recent buyers.
        "schedule": {"hour": 3, "minute": 0},
    },
    "purge-stale-product-views": {
        "task": "apps.recommendations.purge_stale_product_views",
        # Nightly 04:00 UTC, keep 90 days.
        "schedule": {"hour": 4, "minute": 0},
    },
}

# ─────────────────────────────────────────────────────────────────
# Storage (S3-compatible) -- placeholder, used only in production
# ─────────────────────────────────────────────────────────────────
DEFAULT_FILE_STORAGE = config("DEFAULT_FILE_STORAGE", default="django.core.files.storage.FileSystemStorage")

# ─────────────────────────────────────────────────────────────────
# Email
# ─────────────────────────────────────────────────────────────────
# Production default is the real SMTP backend so OTP emails actually
# leave the box. For pure offline dev (no .env overrides), set
# EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend in
# your local .env to print OTPs to the runserver log instead.
EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = config("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="saikot.cse22@gmail.com")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="xweg bljv xdbh tqmf")
# Port-driven TLS: 465 uses implicit TLS (SMTP_SSL), 587 uses STARTTLS
# (TLS upgrade after EHLO). Lets us swap Gmail (587) and Resend (465)
# without touching this file. The localhost guard used to silently
# disable STARTTLS for any host literally named "localhost" -- which
# also broke Gmail if EMAIL_HOST was unset. Now STARTTLS is on whenever
# the backend is SMTP, the host is non-empty, and we're not on 465.
EMAIL_USE_SSL = EMAIL_PORT == 465
EMAIL_USE_TLS = (
    EMAIL_BACKEND.endswith("smtp.EmailBackend")
    and EMAIL_PORT != 465
    and bool(EMAIL_HOST)
)
DEFAULT_FROM_EMAIL = config("EMAIL_FROM", default="saikot.cse22@gmail.com")

# ─────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} {process:d} {thread:d} -- {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": config("LOG_LEVEL", default="INFO"),
    },
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
        "django.request": {"level": "WARNING"},
        "apps": {"level": "INFO", "propagate": True},
    },
}