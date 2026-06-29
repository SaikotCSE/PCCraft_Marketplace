"""Smoke test for the slug-keyed product moderation endpoints.

Covers:
    PATCH /api/v1/admin/products/{slug}/hide/
    PATCH /api/v1/admin/products/{slug}/restore/
    DELETE /api/v1/admin/products/{slug}/

Run against the live dev server on port 8000. Restores state in `finally`.
"""
from __future__ import annotations

import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.products.models import Product, ProductStatus

User = get_user_model()

# Allow the APIClient's default `testserver` host.
if "testserver" not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ["testserver"]

ADMIN_EMAIL = os.environ.get("SMOKE_ADMIN_EMAIL", "admin@pccraft.com")
ADMIN_PASSWORD = os.environ.get("SMOKE_ADMIN_PASSWORD", "admin12345")
TARGET_SLUG = "asus-rog-chakram"


def _client() -> APIClient:
    user = User.objects.filter(email=ADMIN_EMAIL, is_staff=True, is_superuser=True).first()
    if user is None:
        raise SystemExit(f"admin user {ADMIN_EMAIL!r} not found / not superuser")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def main() -> int:
    client, user = _client()
    product = Product.all_objects.get(slug=TARGET_SLUG)
    original_status = product.status
    print(f"[smoke] admin={user.email} slug={product.slug} start_status={original_status}")

    failures: list[str] = []

    def check(label: str, response, expected: int) -> None:
        ok = response.status_code == expected
        marker = "OK " if ok else "FAIL"
        print(f"  [{marker}] {label}: got {response.status_code}, expected {expected}")
        if not ok:
            failures.append(f"{label}: {response.status_code}")
            try:
                print(f"          body: {response.json()}")
            except Exception:
                pass

    try:
        # 1. /restore/ on an ACTIVE product should be idempotent → 200
        r = client.patch(f"/api/v1/admin/products/{TARGET_SLUG}/restore/", {"reason": "smoke"}, format="json")
        check("PATCH restore on ACTIVE (idempotent)", r, 200)

        # 2. /hide/ should set HIDDEN
        r = client.patch(f"/api/v1/admin/products/{TARGET_SLUG}/hide/", {"reason": "smoke hide"}, format="json")
        check("PATCH hide (ACTIVE→HIDDEN)", r, 200)
        product.refresh_from_db()
        if product.status != ProductStatus.HIDDEN:
            failures.append(f"hide did not flip status (got {product.status})")
            print(f"  [FAIL] hide status: {product.status}")

        # 3. /hide/ again should be idempotent (already HIDDEN)
        r = client.patch(f"/api/v1/admin/products/{TARGET_SLUG}/hide/", {}, format="json")
        check("PATCH hide on HIDDEN (idempotent)", r, 200)

        # 4. /restore/ on HIDDEN → ACTIVE
        r = client.patch(f"/api/v1/admin/products/{TARGET_SLUG}/restore/", {"reason": "smoke restore"}, format="json")
        check("PATCH restore (HIDDEN→ACTIVE)", r, 200)
        product.refresh_from_db()
        if product.status != ProductStatus.ACTIVE:
            failures.append(f"restore did not flip status (got {product.status})")
            print(f"  [FAIL] restore status: {product.status}")

        # 5. GET on bogus slug → 404
        r = client.patch("/api/v1/admin/products/this-slug-does-not-exist/hide/", {}, format="json")
        check("PATCH hide on bogus slug (404)", r, 404)

        # 6. Method guard — POST on hide should be 405
        r = client.post(f"/api/v1/admin/products/{TARGET_SLUG}/hide/", {}, format="json")
        check("POST hide (405)", r, 405)

        # 7. Hard delete — create a throw-away draft product so we don't
        #    touch any real listing.
        from django.utils.text import slugify
        from apps.products.models import PriceHistory
        from apps.brands.models import Brand
        from apps.categories.models import Category
        from apps.accounts.models import VendorProfile

        vendor = VendorProfile.objects.first()
        brand = Brand.objects.first()
        category = Category.objects.first()
        if vendor and brand and category:
            probe_name = "Smoke Probe Product DELETE ME"
            probe_slug = slugify(f"{probe_name}-{os.getpid()}")
            probe = Product.objects.create(
                vendor=vendor,
                category=category,
                brand=brand,
                name=probe_name,
                slug=probe_slug,
                sku=f"SMK-{os.getpid()}",
                base_price=1.00,
                status=ProductStatus.DRAFT,
            )
            PriceHistory.objects.create(product=probe, price=probe.effective_price)
            try:
                r = client.delete(
                    f"/api/v1/admin/products/{probe.slug}/",
                    {"reason": "smoke hard-delete"},
                    format="json",
                )
                check(f"DELETE hard-delete ({probe.slug})", r, 200)
                still_exists = Product.all_objects.filter(pk=probe.pk).exists()
                if still_exists:
                    failures.append(f"hard-delete left row behind for {probe.slug}")
                    print(f"  [FAIL] {probe.slug} still exists after DELETE")
            finally:
                # Defensive cleanup — if DELETE failed, remove our probe
                # manually so we don't litter the DB.
                Product.all_objects.filter(pk=probe.pk).delete()
        else:
            print("  [skip] missing vendor/brand/category for hard-delete fixture")
    finally:
        # Restore original status no matter what.
        Product.all_objects.filter(slug=TARGET_SLUG).update(status=original_status)
        print(f"[smoke] restored {TARGET_SLUG} to {original_status}")

    if failures:
        print(f"\n[smoke] FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\n[smoke] PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())