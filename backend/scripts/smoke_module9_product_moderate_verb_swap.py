"""Smoke test: POST→PATCH verb swap for ``/admin/products/{id}/moderate/``.

Mirrors smoke_module9_review_verb_swap.py pattern:
1. Authenticate as admin via JWT bearer
2. Pick any real product
3. POST on /moderate/ → expect 405
4. PATCH on /moderate/ with valid status transition → expect 200
5. Restore original status (idempotency)
6. PATCH on bogus id → expect 404
"""
from __future__ import annotations

import os
import sys

BACKEND = "/home/wang-lin/Saikot/PCCraft_Marketplace/backend"
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.test import Client  # noqa: E402
from rest_framework_simplejwt.tokens import RefreshToken  # noqa: E402

from apps.accounts.models import CustomUser  # noqa: E402
from apps.products.models import Product, ProductStatus  # noqa: E402

if "testserver" not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ["testserver"]


def _admin_token() -> tuple[str, CustomUser]:
    admin = CustomUser.objects.filter(role="admin", is_active=True).first()
    if admin is None:
        raise SystemExit("No active admin user in DB — cannot smoke test.")
    access = str(RefreshToken.for_user(admin).access_token)
    return access, admin


def _hdrs(token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def main() -> int:
    client = Client()
    token, admin = _admin_token()
    headers = _hdrs(token)

    product = (
        Product.objects.filter(is_active=True, status=ProductStatus.ACTIVE)
        .order_by("created_at")
        .first()
    )
    if product is None:
        product = Product.objects.filter(is_active=True).order_by("created_at").first()
    assert product is not None, "No products in DB to exercise /moderate/"

    url = f"/api/v1/admin/products/{product.id}/moderate/"
    bogus_url = "/api/v1/admin/products/00000000-0000-0000-0000-000000000000/moderate/"
    original_status = product.status

    print(f"[smoke] admin={admin.email} product_id={product.id} original_status={original_status}")

    failures: list[str] = []

    # 1. POST should now be 405
    r = client.post(
        url,
        data={"status": ProductStatus.ARCHIVED},
        content_type="application/json",
        **headers,
    )
    if r.status_code != 405:
        failures.append(f"POST moderate (should be 405): got {r.status_code} body={r.content!r}")
    print(f"  [{'OK ' if r.status_code == 405 else 'FAIL'}] POST moderate (should be 405): got {r.status_code}, expected 405")

    # 2. PATCH should succeed with a valid status
    target_status = (
        ProductStatus.ACTIVE
        if original_status != ProductStatus.ACTIVE
        else ProductStatus.ARCHIVED
    )
    r = client.patch(
        url,
        data={"status": target_status},
        content_type="application/json",
        **headers,
    )
    if r.status_code != 200:
        failures.append(f"PATCH moderate (should be 200): got {r.status_code} body={r.content!r}")
    print(f"  [{'OK ' if r.status_code == 200 else 'FAIL'}] PATCH moderate (should be 200): got {r.status_code}, expected 200")

    # 3. Restore original status (idempotency)
    if r.status_code == 200:
        r2 = client.patch(
            url,
            data={"status": original_status},
            content_type="application/json",
            **headers,
        )
        if r2.status_code != 200:
            failures.append(f"PATCH restore (should be 200): got {r2.status_code}")
        print(f"  [{'OK ' if r2.status_code == 200 else 'FAIL'}] PATCH restore original (should be 200): got {r2.status_code}, expected 200")

    # 4. PATCH on bogus id should be 404
    r = client.patch(
        bogus_url,
        data={"status": ProductStatus.ACTIVE},
        content_type="application/json",
        **headers,
    )
    if r.status_code != 404:
        failures.append(f"PATCH moderate bogus id (should be 404): got {r.status_code}")
    print(f"  [{'OK ' if r.status_code == 404 else 'FAIL'}] PATCH moderate bogus id (should be 404): got {r.status_code}, expected 404")

    # Confirm product is back where it started
    product.refresh_from_db()
    if product.status != original_status:
        failures.append(f"product status drifted: now {product.status}, expected {original_status}")
    print(f"[smoke] restored product {product.id} status={product.status}")

    if failures:
        print("[smoke] FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("[smoke] PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())