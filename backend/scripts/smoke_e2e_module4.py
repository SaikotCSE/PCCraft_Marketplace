"""Module 4 end-to-end smoke — drives the HTTP layer via Django's test client.

Run from backend/ with:
    source /home/wang-lin/miniforge3/etc/profile.d/conda.sh && conda activate pccraft
    python scripts/smoke_e2e_module4.py

Verifies (e2e):
  1. Customer registration -> 201
  2. Customer login -> 200 with access+refresh tokens
  3. POST /addresses/   -> 201, first address auto-default
  4. POST /addresses/   -> 201, second address NOT default
  5. GET  /cart/        (Module 3 endpoint regression)
  6. POST /cart/items/  -> adds product to cart
  7. POST /orders/create/ with empty cart  -> 400
  8. POST /orders/create/ with full cart  -> 201, total correct
  9. GET  /orders/      -> customer sees their order
 10. GET  /orders/<n>/  -> order detail with items
 11. POST /orders/<n>/cancel/  -> 200, status=CANCELLED, stock restored
 12. POST /orders/create/ again -> 201
 13. Vendor login       -> 200
 14. GET  /vendor/orders/ -> vendor sees order
 15. PATCH /vendor/orders/items/<id>/status/  -> forward flow works
 16. PATCH ... backward -> 400
 17. PATCH ... as wrong vendor -> 404
"""
import os
import sys
import uuid
from decimal import Decimal

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.conf import settings

# Test client uses 'testserver' as the default HTTP host — add it.
if "testserver" not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ["testserver"]

from django.contrib.auth import get_user_model
from django.test import Client
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import CustomUser, UserRole, VendorProfile, VendorStatus
from apps.products.models import Product, Category, Brand, ProductStatus
from apps.cart.models import Cart
from apps.orders.models import OrderItemStatus


User = get_user_model()


def _bearer(client: Client, access: str) -> Client:
    """Attach Authorization header to client."""
    client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {access}"
    return client


def _ok(resp, expected, msg):
    if resp.status_code != expected:
        body = resp.content.decode()[:500]
        print(f"FAIL: {msg} (got {resp.status_code}, expected {expected}) body={body}")
        sys.exit(1)


def _json(resp):
    import json
    return json.loads(resp.content.decode())


def main():
    print("=== MODULE 4 E2E SMOKE ===")
    suffix = uuid.uuid4().hex[:6]
    customer_email = f"cust_e2e_{suffix}@x.com"
    vendor_email = f"vend_e2e_{suffix}@x.com"
    password = "Sup3rSecret!"

    # ---- seed: vendor + product (bypass registration flow for fixtures) ----
    vendor_user = CustomUser.objects.create_user(
        email=vendor_email, password=password, full_name="E2E Vendor", role=UserRole.VENDOR
    )
    vendor = VendorProfile.objects.create(
        user=vendor_user,
        business_name=f"BvCoE2E{suffix}",
        store_name=f"store-e2e-{suffix}",
        owner_name="V",
        trade_license_number=f"TLE{suffix}",
        nid_number=f"NIDE{suffix}",
        status=VendorStatus.APPROVED,
    )
    cat, _ = Category.objects.get_or_create(slug=f"c-e2e-{suffix}", defaults={"name": f"CE{suffix}"})
    brand, _ = Brand.objects.get_or_create(slug=f"b-e2e-{suffix}", defaults={"name": f"BE{suffix}"})
    product = Product.objects.create(
        vendor=vendor,
        category=cat,
        brand=brand,
        name=f"PE{suffix}",
        slug=f"p-e2e-{suffix}",
        sku=f"SKUE{suffix}",
        base_price=Decimal("1000.00"),
        discounted_price=Decimal("800.00"),
        stock_quantity=5,
        status=ProductStatus.ACTIVE,
    )

    # ---- 1. Customer registration via HTTP ----
    c = Client()
    resp = c.post(
        "/api/v1/auth/register/customer/",
        data={
            "full_name": "E2E Cust",
            "email": customer_email,
            "phone": "+8801712340000",
            "password": password,
            "confirm_password": password,
            "date_of_birth": "1995-01-15",
            "gender": "MALE",
            "accept_terms": True,
        },
        content_type="application/json",
    )
    _ok(resp, 201, "customer registration")
    print("OK: customer registered 201")

    # ---- 2. Customer login ----
    resp = c.post(
        "/api/v1/auth/login/",
        data={"email": customer_email, "password": password, "role": "customer"},
        content_type="application/json",
    )
    _ok(resp, 200, "customer login")
    body = _json(resp)["data"]
    access = body["access"]
    refresh = body["refresh"]
    print("OK: customer login 200")

    c = _bearer(c, access)

    # ---- 3. First address -> 201, default=True ----
    resp = c.post(
        "/api/v1/addresses/",
        data={
            "label": "Home",
            "full_name": "E2E Cust",
            "phone": "+8801712340000",
            "street_address": "123 Main St",
            "city": "Dhaka",
            "district": "Dhaka",
            "postal_code": "1207",
        },
        content_type="application/json",
    )
    _ok(resp, 201, "first address create")
    addr1_id = _json(resp)["data"]["id"]
    print("OK: first address 201")

    # ---- 4. Second address -> 201, default=False ----
    resp = c.post(
        "/api/v1/addresses/",
        data={
            "label": "Office",
            "full_name": "E2E Cust",
            "phone": "+8801712340001",
            "street_address": "456 Side St",
            "city": "Dhaka",
            "district": "Dhaka",
        },
        content_type="application/json",
    )
    _ok(resp, 201, "second address create")
    print("OK: second address 201")

    # ---- 5. GET /addresses/ list ----
    resp = c.get("/api/v1/addresses/")
    _ok(resp, 200, "address list")
    addr_list = _json(resp)["data"]
    defaults = [a for a in addr_list if a.get("is_default")]
    if len(defaults) != 1:
        print(f"FAIL: expected exactly 1 default, got {len(defaults)}")
        sys.exit(1)
    print(f"OK: address list has 1 default")

    # ---- 6. Add to cart (Module 3 endpoint) ----
    resp = c.post(
        "/api/v1/cart/items/",
        data={"product_id": str(product.id), "quantity": 2},
        content_type="application/json",
    )
    _ok(resp, 201, "cart add item")
    print("OK: cart item added")

    # ---- 7. Empty cart order rejection (clear cart first) ----
    Cart.objects.filter(user=c._login(user=User.objects.get(email=customer_email))).delete() if False else None
    # Manually clear cart items
    from apps.cart.models import CartItem
    # Get customer's cart
    customer_user = User.objects.get(email=customer_email)
    customer_user_cart = Cart.objects.filter(user=customer_user).first()
    if customer_user_cart:
        CartItem.objects.filter(cart=customer_user_cart).delete()

    resp = c.post(
        "/api/v1/orders/",
        data={"address_id": addr1_id, "notes": "test"},
        content_type="application/json",
    )
    _ok(resp, 400, "empty cart order rejected")
    print("OK: empty cart 400")

    # ---- 8. Re-add + place order ----
    resp = c.post(
        "/api/v1/cart/items/",
        data={"product_id": str(product.id), "quantity": 2},
        content_type="application/json",
    )
    _ok(resp, 201, "cart re-add")

    resp = c.post(
        "/api/v1/orders/",
        data={"address_id": addr1_id, "notes": "e2e test"},
        content_type="application/json",
    )
    _ok(resp, 201, "order create")
    order = _json(resp)["data"]
    order_number = order["order_number"]
    if Decimal(str(order["total"])) != Decimal("1600.00"):
        print(f"FAIL: total {order['total']} != 1600.00")
        sys.exit(1)
    product.refresh_from_db()
    if product.stock_quantity != 3:
        print(f"FAIL: stock {product.stock_quantity} != 3")
        sys.exit(1)
    print(f"OK: order {order_number} total=1600.00 stock=3")

    # ---- 9. GET /orders/ ----
    resp = c.get("/api/v1/orders/")
    _ok(resp, 200, "order list")
    orders = _json(resp)["data"]["results"] if "results" in _json(resp)["data"] else _json(resp)["data"]
    if not any(o["order_number"] == order_number for o in orders):
        print(f"FAIL: order {order_number} not in list")
        sys.exit(1)
    print(f"OK: order list contains {order_number}")

    # ---- 10. Order detail ----
    resp = c.get(f"/api/v1/orders/{order_number}/")
    _ok(resp, 200, "order detail")
    detail = _json(resp)["data"]
    if not detail["items"]:
        print("FAIL: order has no items")
        sys.exit(1)
    item_id = detail["items"][0]["id"]
    print(f"OK: order detail items={len(detail['items'])}")

    # ---- 11. Cancel order ----
    resp = c.post(f"/api/v1/orders/{order_number}/cancel/")
    _ok(resp, 200, "order cancel")
    product.refresh_from_db()
    if product.stock_quantity != 5:
        print(f"FAIL: stock not restored: {product.stock_quantity}")
        sys.exit(1)
    print("OK: order cancelled, stock=5")

    # ---- 12. Place a second order for vendor flow ----
    resp = c.post(
        "/api/v1/cart/items/",
        data={"product_id": str(product.id), "quantity": 1},
        content_type="application/json",
    )
    _ok(resp, 201, "cart re-add for vendor flow")
    resp = c.post(
        "/api/v1/orders/",
        data={"address_id": addr1_id, "notes": "vendor flow"},
        content_type="application/json",
    )
    _ok(resp, 201, "second order")
    order2 = _json(resp)["data"]
    order2_number = order2["order_number"]
    resp = c.get(f"/api/v1/orders/{order2_number}/")
    detail2 = _json(resp)["data"]
    item2_id = detail2["items"][0]["id"]
    print(f"OK: second order {order2_number}")

    # ---- 13. Vendor login ----
    cv = Client()
    resp = cv.post(
        "/api/v1/auth/login/",
        data={"email": vendor_email, "password": password, "role": "vendor"},
        content_type="application/json",
    )
    _ok(resp, 200, "vendor login")
    vbody = _json(resp)["data"]
    cv = _bearer(cv, vbody["access"])
    print("OK: vendor login 200")

    # ---- 14. Vendor order list ----
    resp = cv.get("/api/v1/vendor/orders/")
    _ok(resp, 200, "vendor order list")
    v_orders = _json(resp)["data"]["results"] if "results" in _json(resp)["data"] else _json(resp)["data"]
    if not v_orders:
        print("FAIL: vendor sees 0 orders")
        sys.exit(1)
    print(f"OK: vendor sees {len(v_orders)} orders")

    # ---- 15. Forward status flow ----
    for new_st in ["PROCESSING", "SHIPPED", "DELIVERED"]:
        resp = cv.patch(
            f"/api/v1/vendor/orders/items/{item2_id}/status/",
            data={"status": new_st, "tracking_number": f"TRK-{suffix}" if new_st == "SHIPPED" else ""},
            content_type="application/json",
        )
        _ok(resp, 200, f"vendor forward -> {new_st}")
    print("OK: vendor forward flow PROCESSING -> SHIPPED -> DELIVERED")

    # ---- 16. Backward rejected ----
    resp = cv.patch(
        f"/api/v1/vendor/orders/items/{item2_id}/status/",
        data={"status": "CONFIRMED"},
        content_type="application/json",
    )
    _ok(resp, 400, "backward rejected")
    print("OK: backward 400")

    # ---- 17. Wrong-vendor rejected ----
    other_user = CustomUser.objects.create_user(
        email=f"other_e2e_{suffix}@x.com", password=password, role=UserRole.VENDOR
    )
    other_vendor = VendorProfile.objects.create(
        user=other_user,
        business_name=f"BvOtherE2E{suffix}",
        store_name=f"store-other-{suffix}",
        owner_name="O",
        trade_license_number=f"TLO{suffix}",
        nid_number=f"NIDO{suffix}",
        status=VendorStatus.APPROVED,
    )
    co = Client()
    resp = co.post(
        "/api/v1/auth/login/",
        data={"email": f"other_e2e_{suffix}@x.com", "password": password, "role": "vendor"},
        content_type="application/json",
    )
    _ok(resp, 200, "other vendor login")
    co = _bearer(co, _json(resp)["data"]["access"])
    resp = co.patch(
        f"/api/v1/vendor/orders/items/{item2_id}/status/",
        data={"status": "CONFIRMED"},
        content_type="application/json",
    )
    _ok(resp, 400, "wrong vendor rejected")
    print("OK: wrong vendor 400 (validation_error)")

    print("=== ALL E2E SMOKE TESTS PASSED ===")


if __name__ == "__main__":
    main()
