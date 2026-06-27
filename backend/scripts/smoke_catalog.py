"""Smoke test for the Module 2 catalog APIs.

Spins up Django's test client and exercises every read-only public
endpoint, plus the vendor tree (which we seed on the fly via
``create_user`` / ``create_vendor`` helpers from ``django.contrib.auth``).

Run with::

    /home/wang-lin/miniforge3/envs/pccraft/bin/python backend/scripts/smoke_catalog.py
"""
from __future__ import annotations

import os
import sys
import json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.test import Client  # noqa: E402
from rest_framework_simplejwt.tokens import RefreshToken  # noqa: E402

from apps.accounts.models import VendorProfile  # noqa: E402
from apps.brands.models import Brand  # noqa: E402
from apps.categories.models import Category  # noqa: E402

User = get_user_model()


def _ok(label: str, payload) -> None:
    if isinstance(payload, dict):
        print(f"OK  {label}: keys={list(payload.keys())[:6]}")
    else:
        print(f"OK  {label}: {payload}")


def _err(label: str, payload) -> None:
    print(f"FAIL {label}: {payload}")


def main() -> int:
    c = Client()

    # --- public read-only endpoints --------------------------------
    r = c.get("/api/v1/categories/")
    if r.status_code == 200:
        body = r.json()
        _ok("GET /categories/", f"{len(body['data'])} rows, sample={body['data'][0]['name']}")
    else:
        _err("GET /categories/", r.content[:200])
        return 1

    r = c.get("/api/v1/brands/")
    if r.status_code == 200:
        body = r.json()
        _ok("GET /brands/", f"{len(body['data'])} rows, sample={body['data'][0]['name']}")
    else:
        _err("GET /brands/", r.content[:200])
        return 1

    r = c.get("/api/v1/products/")
    if r.status_code == 200:
        body = r.json()
        _ok("GET /products/", f"{body.get('meta', {}).get('pagination', {}).get('total', len(body.get('data', [])))} rows")
    else:
        _err("GET /products/", r.content[:200])
        return 1

    # --- vendor write path -----------------------------------------
    user, _ = User.objects.get_or_create(
        email="vendor@example.com",
        defaults={"is_active": True, "role": "VENDOR"},
    )
    user.set_password("test-password-123!")
    user.is_active = True
    user.save()
    vendor, _ = VendorProfile.all_objects.get_or_create(
        user=user,
        defaults={
            "business_name": "Smoke Test Co",
            "owner_name": "Vendor Owner",
            "business_type": "SOLE_PROPRIETORSHIP",
            "business_phone": "+8801700000000",
            "trade_license_number": "TL-SMOKE-001",
            "business_address": {"line1": "1 Test St"},
            "store_name": "Smoke Test Shop",
            "store_slug": "smoke-test-shop",
            "status": "APPROVED",
            "approved_at": django.utils.timezone.now(),
        },
    )
    vendor.status = "APPROVED"
    vendor.save()
    brand = Brand.objects.first()
    category = Category.objects.first()
    if not (brand and category):
        _err("seed", "Run seed_catalog first.")
        return 2

    token = str(RefreshToken.for_user(user).access_token)
    auth = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    payload = {
        "name": "Smoke Test GPU",
        "brand": brand.slug,
        "category": category.slug,
        "description": "Sample",
        "short_description": "Sample",
        "base_price": "100.00",
        "sku": "SMOKE-001",
        "stock_quantity": 5,
        "status": "ACTIVE",
        "warranty_months": 12,
        "specs": {},
    }
    r = c.post("/api/v1/vendor/products/", data=payload,
               content_type="application/json", **auth)
    if r.status_code == 201:
        body = r.json()
        slug = body["data"]["slug"]
        _ok("POST /vendor/products/", f"slug={slug}")
    else:
        _err("POST /vendor/products/", f"{r.status_code} {r.content[:400]}")
        return 3

    r = c.get(f"/api/v1/products/{slug}/", **auth)
    if r.status_code == 200:
        body = r.json()
        _ok("GET /products/{slug}/",
            f"vendor={body['data']['vendor']['store_name']}, "
            f"price={body['data']['effective_price']}")
    else:
        _err("GET /products/{slug}/", r.content[:400])
        return 4

    # --- vendor list -----------------------------------------------
    r = c.get("/api/v1/vendor/products/", **auth)
    if r.status_code == 200:
        body = r.json()
        n = len(body.get("data", []))
        _ok("GET /vendor/products/", f"{n} vendor rows")
    else:
        _err("GET /vendor/products/", r.content[:400])
        return 5

    # --- permission check: anonymous can't write -------------------
    anon = Client()
    r = anon.post("/api/v1/vendor/products/", data=payload,
                  content_type="application/json")
    if r.status_code in (401, 403):
        _ok("anon denied", f"status={r.status_code}")
    else:
        _err("anon denied", f"status={r.status_code}, expected 401/403")
        return 6

    print("\nAll smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())