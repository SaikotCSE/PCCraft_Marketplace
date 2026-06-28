"""End-to-end smoke test against a live Django dev server.

Simulates what the frontend will do:
  1. Register a customer (or reuse one).
  2. Obtain a JWT via /api/v1/auth/token/.
  3. Browse products to find an active one.
  4. Add to cart via POST /api/v1/cart/items/ (product_id).
  5. Verify DELETE /api/v1/cart/ clears everything (frontend path).
  6. Add again, then DELETE /api/v1/cart/items/<id>/ single-row remove.
  7. POST /api/v1/wishlist/items/ with `{product: id}` (frontend path).
  8. POST /api/v1/wishlist/items/<id>/move-to-cart/ (frontend path).
  9. Verify cart count incremented and wishlist item removed.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

import django  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.accounts.models import CustomUser, UserRole, VendorProfile  # noqa: E402
from apps.brands.models import Brand  # noqa: E402
from apps.categories.models import Category  # noqa: E402
from apps.products.models import Product, ProductStatus  # noqa: E402

BASE = "http://127.0.0.1:8000/api/v1"

ok = True


def check(label: str, cond: bool, detail: str = "") -> None:
    global ok
    tag = "[OK]  " if cond else "[FAIL]"
    print(f"{tag} {label}{(' :: ' + detail) if detail else ''}")
    if not cond:
        ok = False


def req(method, path, token=None, body=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            payload = resp.read().decode("utf-8")
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8")
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, {"raw": payload}


# ----------------------------------------------------------------- seed
customer_email = "e2e_m3@example.com"
vendor_email = "e2e_m3_vendor@example.com"
password = "testpass1234!"

customer, created = CustomUser.objects.get_or_create(
    email=customer_email,
    defaults={"full_name": "E2E M3 Customer", "role": UserRole.CUSTOMER},
)
if created or not customer.has_usable_password():
    customer.set_password(password)
    customer.save()

vendor_user, _ = CustomUser.objects.get_or_create(
    email=vendor_email,
    defaults={"full_name": "E2E M3 Vendor", "role": UserRole.VENDOR},
)
vendor_user.set_password(password)
vendor_user.save()
vendor, _ = VendorProfile.objects.get_or_create(
    user=vendor_user,
    defaults={"store_name": "E2E M3 Store"},
)

brand, _ = Brand.objects.get_or_create(slug="e2e-m3-brand", defaults={"name": "E2E M3"})
category, _ = Category.objects.get_or_create(slug="e2e-m3-cat", defaults={"name": "E2E M3 Cat"})

product, _ = Product.objects.get_or_create(
    vendor=vendor,
    sku="E2E-M3-1",
    defaults={
        "name": "E2E M3 Product",
        "slug": "e2e-m3-product",
        "brand": brand,
        "category": category,
        "base_price": Decimal("200.00"),
        "stock_quantity": 10,
        "status": ProductStatus.ACTIVE,
        "is_active": True,
    },
)
Product.objects.filter(pk=product.pk).update(stock_quantity=10)

# ---------------------------------------------------------- authenticate
status, payload = req(
    "POST",
    "/auth/login/",
    body={"email": customer_email, "password": password, "role": "customer"},
)
check("login returns 200", status == 200, str(status))
inner = payload.get("data") or payload
access = inner.get("access")
check("access token returned", bool(access))

# ---------------------------------------------------------- cart flow
# 1. POST /cart/items/ (product_id)
status, payload = req(
    "POST",
    "/cart/items/",
    token=access,
    body={"product_id": str(product.id), "quantity": 2},
)
check("POST /cart/items/ product_id returns 201", status == 201, str(status))
item = (payload.get("data") or payload)
item_id = item.get("id")
check("cart item has UUID id", bool(item_id) and "-" in str(item_id))

# 2. GET /cart/
status, payload = req("GET", "/cart/", token=access)
check("GET /cart/ returns 200", status == 200)
items = (payload.get("data") or payload).get("items", [])
check("cart has 1 item", len(items) == 1, f"got {len(items)}")

# 3. PATCH /cart/items/<id>/
status, payload = req(
    "PATCH",
    f"/cart/items/{item_id}/",
    token=access,
    body={"quantity": 3},
)
check("PATCH /cart/items/<id>/ returns 200", status == 200)
q = ((payload.get("data") or payload).get("quantity"))
check("quantity updated to 3", q == 3, f"got {q}")

# 4. DELETE /cart/  (frontend alias path)
status, payload = req("DELETE", "/cart/", token=access)
check("DELETE /cart/ returns 200", status == 200)

status, payload = req("GET", "/cart/", token=access)
items = (payload.get("data") or payload).get("items", [])
check("cart empty after DELETE /cart/", len(items) == 0, f"got {len(items)}")

# 5. add again, then DELETE single row
status, payload = req(
    "POST",
    "/cart/items/",
    token=access,
    body={"product_id": str(product.id), "quantity": 1},
)
item_id_2 = ((payload.get("data") or payload)).get("id")
check("re-add to cart", bool(item_id_2))

status, payload = req("DELETE", f"/cart/items/{item_id_2}/", token=access)
check("DELETE /cart/items/<id>/ returns 200", status == 200)

# ---------------------------------------------------------- wishlist flow
# 6. POST /wishlist/items/ with {product: id}
status, payload = req(
    "POST",
    "/wishlist/items/",
    token=access,
    body={"product": str(product.id)},
)
check("POST /wishlist/items/ {product: id} returns 201", status == 201, str(status))
wl_item = payload.get("data") or payload
wl_id = wl_item.get("id")
check("wishlist item has UUID id", bool(wl_id) and "-" in str(wl_id))

# 7. GET /wishlist/
status, payload = req("GET", "/wishlist/", token=access)
items = (payload.get("data") or payload).get("items", [])
check("wishlist has 1 item", len(items) == 1, f"got {len(items)}")

# 8. POST /wishlist/items/<id>/move-to-cart/
status, payload = req(
    "POST",
    f"/wishlist/items/{wl_id}/move-to-cart/",
    token=access,
    body={"quantity": 2},
)
check("move-to-cart returns 200", status == 200, str(status))
moved = (payload.get("data") or payload)
check("move-to-cart returned cart item", bool(moved.get("id")))
check("moved cart qty=2", moved.get("quantity") == 2, f"got {moved.get('quantity')}")

# 9. Verify cart now has 1 item with qty=2, wishlist is empty
status, payload = req("GET", "/cart/", token=access)
cart_items = (payload.get("data") or payload).get("items", [])
check("cart has 1 item after move", len(cart_items) == 1, f"got {len(cart_items)}")
if cart_items:
    check("cart qty is 2", cart_items[0].get("quantity") == 2, f"got {cart_items[0].get('quantity')}")

status, payload = req("GET", "/wishlist/", token=access)
wl_items = (payload.get("data") or payload).get("items", [])
check("wishlist empty after move", len(wl_items) == 0, f"got {len(wl_items)}")

# 10. POST /wishlist/items/ with {product_id: id} (backwards compat)
status, payload = req(
    "POST",
    "/wishlist/items/",
    token=access,
    body={"product_id": str(product.id)},
)
check("POST /wishlist/items/ {product_id: id} returns 201", status == 201, str(status))

# 11. Verify auth + role guards
status, _ = req("GET", "/cart/")
check("anonymous GET /cart/ returns 401", status == 401, str(status))

# Cleanup
req("DELETE", "/cart/", token=access)
req("DELETE", "/wishlist/clear/", token=access)
Product.objects.filter(pk=product.pk).delete()
Brand.objects.filter(pk=brand.pk).delete()
Category.objects.filter(pk=category.pk).delete()
VendorProfile.objects.filter(pk=vendor.pk).delete()
CustomUser.objects.filter(email__in=[customer_email, vendor_email]).delete()

print()
print("=" * 70)
print("E2E RESULT:", "PASS" if ok else "FAIL")
print("=" * 70)
sys.exit(0 if ok else 1)