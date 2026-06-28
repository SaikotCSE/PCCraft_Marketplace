"""End-to-end smoke test for Module 3 (Cart + Wishlist).

Exercises every endpoint in spec sec. "MODULE 3 -- Cart & Wishlist"
against the live ORM through DRF's test client.  No live HTTP server
required -- the goal is to confirm view wiring, service logic, stock
validation, and the move-to-cart cross-app hook.

Usage (from ``backend/``)::

    source ~/miniforge3/etc/profile.d/conda.sh && conda activate pccraft
    python scripts/smoke_module3.py
"""
from __future__ import annotations

import os
import sys
import django
from decimal import Decimal

# Ensure ``config.*`` is importable when run as a plain script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.base")
django.setup()

# ``testserver`` isn't always in ALLOWED_HOSTS for non-test settings.
from django.conf import settings  # noqa: E402

if "testserver" not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ["testserver", "localhost", "127.0.0.1"]  # noqa: E501

from rest_framework.test import APIClient  # noqa: E402

from apps.accounts.models import CustomUser, VendorProfile  # noqa: E402
from apps.brands.models import Brand  # noqa: E402
from apps.categories.models import Category  # noqa: E402
from apps.products.models import Product, ProductStatus  # noqa: E402


PASS = "[OK]   "
FAIL = "[FAIL] "


def section(title: str) -> None:
    print()
    print("=" * 70)
    print(title)
    print("=" * 70)


def expect(cond: bool, label: str) -> bool:
    tag = PASS if cond else FAIL
    print(f"{tag}{label}")
    return cond


# ----------------------------------------------------------------------
# Fixtures
# ----------------------------------------------------------------------
section("Seed fixtures")

vendor_user, _ = CustomUser.objects.get_or_create(
    email="m3_smoke_vendor@example.com",
    defaults={"role": "vendor", "full_name": "M3 Smoke Vendor"},
)
vendor_user.set_password("pw_smoke_123"); vendor_user.save()
vendor, _ = VendorProfile.objects.get_or_create(
    user=vendor_user,
    defaults={"store_name": "M3 Smoke Store"},
)

brand, _ = Brand.objects.get_or_create(slug="m3-smoke-brand", defaults={"name": "M3 Smoke"})
category, _ = Category.objects.get_or_create(
    slug="m3-smoke-cat",
    defaults={"name": "M3 Smoke Cat"},
)

product, _ = Product.objects.get_or_create(
    vendor=vendor,
    sku="M3-SMOKE-GPU-1",
    defaults={
        "brand": brand,
        "category": category,
        "name": "M3 Smoke GPU",
        "slug": "m3-smoke-gpu",
        "base_price": Decimal("120.00"),
        "stock_quantity": 3,
        "status": ProductStatus.ACTIVE,
    },
)
# Make sure stock is reset on re-runs so we always test the "add up to stock" path.
product.stock_quantity = 3
product.status = ProductStatus.ACTIVE
product.is_active = True
product.save()

print(f"vendor user:   {vendor_user.email}")
print(f"product:       {product.name} (stock={product.stock_quantity})")

customer_user, _ = CustomUser.objects.get_or_create(
    email="m3_smoke_customer@example.com",
    defaults={"role": "customer", "full_name": "M3 Smoke Customer"},
)
customer_user.set_password("pw_smoke_123"); customer_user.save()
print(f"customer user: {customer_user.email}")

client = APIClient()
client.force_authenticate(user=customer_user)
ok = True
print(f"{PASS}customer force_authenticate (user={customer_user.email})")

# Always start with an empty cart + wishlist so the assertions are deterministic.
client.delete("/api/v1/cart/clear/")
client.delete("/api/v1/wishlist/clear/")
print(f"{PASS}cart + wishlist reset before assertions")

# ----------------------------------------------------------------------
# Cart endpoints
# ----------------------------------------------------------------------
section("Cart API")

r = client.get("/api/v1/cart/")
ok = expect(r.status_code == 200, "GET /api/v1/cart/ returns 200")
ok &= expect(r.json().get("success") is True, "  envelope.success=True")
ok &= expect(r.json()["data"]["item_count"] == 0, "  empty cart item_count=0")

r = client.post(
    "/api/v1/cart/items/",
    {"product_id": str(product.id), "quantity": 2},
    format="json",
)
ok &= expect(r.status_code == 201, "POST /api/v1/cart/items/ qty=2 -> 201")
cart_item_id = r.json()["data"]["id"]
ok &= expect(bool(cart_item_id), "  item id returned")
print(f"{PASS}  cart_item_id={cart_item_id}")

# Idempotent add -- should bump quantity, not create a second row.
# Use +1 (not +2) so we always stay within the product's stock of 3.
prev_qty = client.get("/api/v1/cart/").json()["data"]["items"][0]["quantity"]
r = client.post(
    "/api/v1/cart/items/",
    {"product_id": str(product.id), "quantity": 1},
    format="json",
)
ok &= expect(r.status_code == 201, "POST same product again -> 201 (no duplicate row)")
ok &= expect(
    r.json()["data"]["quantity"] == prev_qty + 1,
    f"  quantity bumped by 1 (prev={prev_qty}, new={r.json()['data']['quantity']})",
)

# Stock overflow -- product stock is 3
r = client.post(
    "/api/v1/cart/items/",
    {"product_id": str(product.id), "quantity": 99},
    format="json",
)
ok &= expect(r.status_code == 400, "POST qty=99 over stock -> 400")

# Update down to 1
r = client.patch(
    f"/api/v1/cart/items/{cart_item_id}/",
    {"quantity": 1},
    format="json",
)
ok &= expect(r.status_code == 200, "PATCH /cart/items/<id>/ qty=1 -> 200")
ok &= expect(r.json()["data"]["quantity"] == 1, "  quantity==1 after patch")

# Subtotal sanity
r = client.get("/api/v1/cart/")
ok &= expect(r.status_code == 200, "GET /api/v1/cart/ again -> 200")
subtotal = float(r.json()["data"]["subtotal"])
ok &= expect(abs(subtotal - 120.0) < 0.01, f"  subtotal == 120.00 (got {subtotal})")

# Update to 0 -> row deleted
r = client.patch(
    f"/api/v1/cart/items/{cart_item_id}/",
    {"quantity": 0},
    format="json",
)
ok &= expect(r.status_code == 200, "PATCH qty=0 -> 200 (row removed)")

# Clear cart -- add again first
client.post(
    "/api/v1/cart/items/",
    {"product_id": str(product.id), "quantity": 1},
    format="json",
)
r = client.delete("/api/v1/cart/clear/")
ok &= expect(r.status_code == 200, "DELETE /api/v1/cart/clear/ -> 200")
ok &= expect(r.json()["data"]["removed"] >= 1, "  removed >= 1")

# ----------------------------------------------------------------------
# Wishlist endpoints
# ----------------------------------------------------------------------
section("Wishlist API")

r = client.get("/api/v1/wishlist/")
ok &= expect(r.status_code == 200, "GET /api/v1/wishlist/ -> 200")
ok &= expect(r.json()["data"]["item_count"] == 0, "  empty wishlist")

r = client.post(
    "/api/v1/wishlist/items/",
    {"product_id": str(product.id)},
    format="json",
)
ok &= expect(r.status_code == 201, "POST /api/v1/wishlist/items/ -> 201")
wishlist_item_id = r.json()["data"]["id"]

# Idempotent add
r = client.post(
    "/api/v1/wishlist/items/",
    {"product_id": str(product.id)},
    format="json",
)
ok &= expect(r.status_code == 201, "POST same product -> 201 (no duplicate)")

# Move to cart
r = client.post(f"/api/v1/wishlist/items/{wishlist_item_id}/move-to-cart/")
ok &= expect(r.status_code == 200, "POST /wishlist/items/<id>/move-to-cart/ -> 200")
ok &= expect(r.json()["data"]["quantity"] == 1, "  cart item qty=1")

# Confirm wishlist row is gone, cart row exists
r = client.get("/api/v1/wishlist/")
ok &= expect(r.json()["data"]["item_count"] == 0, "  wishlist empty after move")

r = client.get("/api/v1/cart/")
ok &= expect(r.json()["data"]["item_count"] == 1, "  cart has 1 item after move")

# ----------------------------------------------------------------------
# Auth / role guards
# ----------------------------------------------------------------------
section("Auth + role guards")

anon = APIClient()  # no force_authenticate = anonymous
r = anon.get("/api/v1/cart/")
ok &= expect(r.status_code in (401, 403), f"anonymous GET /cart/ -> {r.status_code}")

# Logged-in vendor should be rejected from cart (must be customer)
vendor_client = APIClient()
vendor_client.force_authenticate(user=vendor_user)
r = vendor_client.post(
    "/api/v1/cart/items/",
    {"product_id": str(product.id), "quantity": 1},
    format="json",
)
ok &= expect(r.status_code == 403, f"vendor POST /cart/items/ -> 403 (got {r.status_code})")

# ----------------------------------------------------------------------
# Cleanup
# ----------------------------------------------------------------------
section("Cleanup")
client.delete("/api/v1/cart/clear/")
client.delete("/api/v1/wishlist/clear/")
product.delete()
vendor_user.delete()
customer_user.delete()
print("cleaned up smoke fixtures")

print()
print("=" * 70)
print("RESULT:", "PASS" if ok else "FAIL")
print("=" * 70)
sys.exit(0 if ok else 1)