"""Smoke test for the frontend compat shims added to Module 3 backend.

Verifies:
  1. `DELETE /api/v1/cart/` (no `/clear/` suffix) clears the cart.
  2. `POST /api/v1/wishlist/items/` accepts `{product: <id>}` (frontend shape).
  3. `POST /api/v1/wishlist/items/` still accepts `{product_id: <id>}`.
"""
from __future__ import annotations

import os
import sys
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

import django  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.conf import settings  # noqa: E402

settings.ALLOWED_HOSTS = list({*settings.ALLOWED_HOSTS, "testserver"})

from rest_framework.test import APIClient  # noqa: E402

from apps.accounts.models import CustomUser, UserRole, VendorProfile  # noqa: E402
from apps.brands.models import Brand  # noqa: E402
from apps.categories.models import Category  # noqa: E402
from apps.products.models import Product, ProductStatus  # noqa: E402

ok = True


def check(label: str, cond: bool, detail: str = "") -> None:
    global ok
    tag = "[OK]  " if cond else "[FAIL]"
    print(f"{tag} {label}{(' :: ' + detail) if detail else ''}")
    if not cond:
        ok = False


# --------------------------------------------------------------------- seed
customer, _ = CustomUser.objects.get_or_create(
    email="compat@example.com",
    defaults={"full_name": "Compat User", "role": UserRole.CUSTOMER},
)
vendor_user, _ = CustomUser.objects.get_or_create(
    email="compat-vendor@example.com",
    defaults={"full_name": "Compat Vendor", "role": UserRole.VENDOR},
)
vendor, _ = VendorProfile.objects.get_or_create(
    user=vendor_user,
    defaults={"store_name": "Compat Vendor Store"},
)

brand, _ = Brand.objects.get_or_create(slug="compat-brand", defaults={"name": "Compat Brand"})
category, _ = Category.objects.get_or_create(
    slug="compat-cat",
    defaults={"name": "Compat Cat"},
)

p1, _ = Product.objects.get_or_create(
    vendor=vendor,
    sku="COMPAT-1",
    defaults={
        "name": "Compat Product",
        "slug": "compat-product",
        "brand": brand,
        "category": category,
        "base_price": Decimal("100.00"),
        "stock_quantity": 5,
        "status": ProductStatus.ACTIVE,
        "is_active": True,
    },
)
Product.objects.filter(pk=p1.pk).update(stock_quantity=5)

client = APIClient()
client.force_authenticate(user=customer)

# --------------------------------------------------------------------- 1
cart_url = "/api/v1/cart/"
cart_items_url = "/api/v1/cart/items/"

# Seed a cart item via the canonical product_id key
r = client.post(cart_items_url, {"product_id": str(p1.id), "quantity": 2}, format="json")
check("seed cart item via product_id", r.status_code == 201, str(r.status_code))

# Now DELETE /cart/ (no /clear/) - frontend's clearCart uses this
r = client.delete(cart_url)
check("DELETE /cart/ (no /clear/) returns 200", r.status_code == 200, str(r.status_code))
body = r.json()
check("DELETE /cart/ clears items", body.get("data", {}).get("removed", 0) >= 1)

# --------------------------------------------------------------------- 2
wl_url = "/api/v1/wishlist/"
wl_items_url = "/api/v1/wishlist/items/"

r = client.post(wl_items_url, {"product": str(p1.id)}, format="json")
check("POST wishlist with {product: id} returns 201", r.status_code == 201, str(r.status_code))

# --------------------------------------------------------------------- 3
# Clear then verify product_id key still works
client.delete("/api/v1/wishlist/clear/")
r = client.post(wl_items_url, {"product_id": str(p1.id)}, format="json")
check("POST wishlist with {product_id: id} returns 201", r.status_code == 201, str(r.status_code))

# Cleanup
client.delete("/api/v1/wishlist/clear/")
client.delete(cart_url)
Product.objects.filter(pk=p1.pk).delete()
Brand.objects.filter(pk=brand.pk).delete()
Category.objects.filter(pk=category.pk).delete()
VendorProfile.objects.filter(pk=vendor.pk).delete()
CustomUser.objects.filter(email__in=["compat@example.com", "compat-vendor@example.com"]).delete()

print()
print("=" * 70)
print("RESULT:", "PASS" if ok else "FAIL")
print("=" * 70)
sys.exit(0 if ok else 1)