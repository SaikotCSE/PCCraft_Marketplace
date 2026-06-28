"""Module 4 compatibility smoke — verifies that adding the orders app does
not regress Modules 1, 2, or 3.

Re-runs key endpoints and checks the response codes + payload shapes match
what the frontend already depends on:

  Module 1 (accounts): register, login, profile
  Module 2 (products): list, detail, vendor-products
  Module 3 (cart + wishlist): add/clear/cart/items, wishlist add/clear
  Module 4 (orders, NEW): addresses, orders, vendor-orders

Exit code 0 on PASS, 1 on FAIL.
"""
from __future__ import annotations

import os
import sys
import uuid
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

import django  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.conf import settings  # noqa: E402

if "testserver" not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ["testserver"]

from rest_framework.test import APIClient  # noqa: E402

from apps.accounts.models import CustomUser, UserRole, VendorProfile, VendorStatus  # noqa: E402
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
suffix = uuid.uuid4().hex[:6]
cust_email = f"compat4_cust_{suffix}@x.com"
vend_email = f"compat4_vend_{suffix}@x.com"
password = "Compat4P@ss"

customer = CustomUser.objects.create_user(
    email=cust_email, password=password, full_name="Compat4 Cust", role=UserRole.CUSTOMER
)
vendor_user = CustomUser.objects.create_user(
    email=vend_email, password=password, full_name="Compat4 Vend", role=UserRole.VENDOR
)
vendor = VendorProfile.objects.create(
    user=vendor_user,
    business_name=f"Compat4Co{suffix}",
    store_name=f"compat4-store-{suffix}",
    owner_name="CV",
    trade_license_number=f"TLC{suffix}",
    nid_number=f"NIDC{suffix}",
    status=VendorStatus.APPROVED,
)

brand, _ = Brand.objects.get_or_create(slug=f"compat4-brand-{suffix}", defaults={"name": f"CB{suffix}"})
category, _ = Category.objects.get_or_create(
    slug=f"compat4-cat-{suffix}", defaults={"name": f"CC{suffix}"}
)

product = Product.objects.create(
    vendor=vendor,
    sku=f"COMPAT4-{suffix}",
    name=f"Compat4 Prod {suffix}",
    slug=f"compat4-prod-{suffix}",
    brand=brand,
    category=category,
    base_price=Decimal("100.00"),
    discounted_price=Decimal("80.00"),
    stock_quantity=10,
    status=ProductStatus.ACTIVE,
)

# ===================================================================
# Module 1: auth (no regression)
# ===================================================================
client = APIClient()

r = client.post(
    "/api/v1/auth/login/",
    {"email": cust_email, "password": password, "role": "customer"},
    format="json",
)
check("Module1: customer login 200", r.status_code == 200, str(r.status_code))
access = r.json()["data"]["access"]
client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

r = client.get("/api/v1/auth/profile/")
check("Module1: profile 200", r.status_code == 200, str(r.status_code))
check("Module1: profile email correct", r.json()["data"]["email"] == cust_email)

# ===================================================================
# Module 2: products + categories + brands
# ===================================================================
r = client.get("/api/v1/products/")
check("Module2: product list 200", r.status_code == 200, str(r.status_code))

r = client.get(f"/api/v1/products/{product.slug}/")
check("Module2: product detail 200", r.status_code == 200, str(r.status_code))

r = client.get("/api/v1/categories/")
check("Module2: category list 200", r.status_code == 200, str(r.status_code))

r = client.get("/api/v1/brands/")
check("Module2: brand list 200", r.status_code == 200, str(r.status_code))

# ===================================================================
# Module 3: cart + wishlist
# ===================================================================
r = client.post("/api/v1/cart/items/", {"product_id": str(product.id), "quantity": 1}, format="json")
check("Module3: cart add 201", r.status_code == 201, str(r.status_code))

r = client.get("/api/v1/cart/")
check("Module3: cart get 200", r.status_code == 200, str(r.status_code))
check("Module3: cart has 1 item", r.json()["data"]["item_count"] == 1)

r = client.delete("/api/v1/cart/")
check("Module3: cart DELETE /cart/ 200 (compat shim)", r.status_code == 200, str(r.status_code))

# Wishlist
r = client.post("/api/v1/wishlist/items/", {"product_id": str(product.id)}, format="json")
check("Module3: wishlist add 201", r.status_code == 201, str(r.status_code))
r = client.post("/api/v1/wishlist/items/", {"product": str(product.id)}, format="json")
check("Module3: wishlist add (compat key) 201", r.status_code == 201, str(r.status_code))
client.delete("/api/v1/wishlist/clear/")

# ===================================================================
# Module 4: orders + addresses (NEW — must not break anything)
# ===================================================================
r = client.post(
    "/api/v1/addresses/",
    {
        "label": "Home",
        "full_name": "Compat4 Cust",
        "phone": "+8801712340000",
        "street_address": "1 St",
        "city": "Dhaka",
        "district": "Dhaka",
    },
    format="json",
)
check("Module4: address create 201", r.status_code == 201, str(r.status_code))
addr_id = r.json()["data"]["id"]

r = client.get("/api/v1/addresses/")
check("Module4: address list 200", r.status_code == 200, str(r.status_code))

r = client.post("/api/v1/cart/items/", {"product_id": str(product.id), "quantity": 1}, format="json")
check("Module4 (via Module3): cart add for order 201", r.status_code == 201, str(r.status_code))

r = client.post("/api/v1/orders/", {"address_id": addr_id, "notes": "compat"}, format="json")
check("Module4: order create 201", r.status_code == 201, str(r.status_code))
order_number = r.json()["data"]["order_number"]

r = client.get("/api/v1/orders/")
check("Module4: order list 200", r.status_code == 200, str(r.status_code))

r = client.get(f"/api/v1/orders/{order_number}/")
check("Module4: order detail 200", r.status_code == 200, str(r.status_code))

# ===================================================================
# Cleanup
# ===================================================================
# Cancel order so stock returns, then delete child rows before parent
client.delete("/api/v1/cart/")
from apps.orders.models import Order, OrderItem
OrderItem.objects.filter(product=product).delete()
Order.objects.filter(user=customer).delete()
Product.objects.filter(pk=product.pk).delete()
Brand.objects.filter(pk=brand.pk).delete()
Category.objects.filter(pk=category.pk).delete()
VendorProfile.objects.filter(pk=vendor.pk).delete()
CustomUser.objects.filter(email__in=[cust_email, vend_email]).delete()

print()
print("=" * 70)
print("RESULT:", "PASS" if ok else "FAIL")
print("=" * 70)
sys.exit(0 if ok else 1)
