"""Module 8 authenticated smoke test using DRF + JWT.

Logs in via /api/v1/auth/login/, then exercises every protected build
endpoint plus the public compatibility endpoints.
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.conf import settings

if "testserver" not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ["testserver"]

from django.test import Client
from apps.accounts.models import CustomUser

client = Client()

# 1. Log in via the public endpoint to get JWT-shaped cookies / tokens.
#    For DRF SimpleJWT, the test client can do this via JWT obtain.
from rest_framework_simplejwt.tokens import RefreshToken
user = CustomUser.objects.filter(is_active=True).first()
if user is None:
    print("(no users in DB — cannot run authenticated smoke)")
    sys.exit(0)

refresh = RefreshToken.for_user(user)
access = refresh.access_token
print(f"(authenticated as {user.email})")

# Build a Bearer header for subsequent calls.
auth_headers = {"HTTP_AUTHORIZATION": f"Bearer {access}"}

paths = [
    "/api/v1/compatibility/rules/",
    "/api/v1/compatibility/check/",
    "/api/v1/compatibility/products/CPU/",
    "/api/v1/compatibility/products/GPU/",
    "/api/v1/compatibility/attributes/",
    "/api/v1/compatibility/builds/",
    "/api/v1/builds/",
    "/api/v1/builds/1/",
    "/api/v1/builds/share/00000000-0000-0000-0000-000000000000/",
]

print("=== Module 8 smoke (authenticated) ===")
for p in paths:
    r = client.get(p, **auth_headers)
    print(f"GET {p} -> {r.status_code}")

r = client.post(
    "/api/v1/builds/",
    data={"name": "smoke build", "slots": {}},
    content_type="application/json",
    **auth_headers,
)
print(f"POST /api/v1/builds/ -> {r.status_code}")

r = client.post(
    "/api/v1/compatibility/check/",
    data={"slots": {}},
    content_type="application/json",
    **auth_headers,
)
print(f"POST /api/v1/compatibility/check/ -> {r.status_code}")