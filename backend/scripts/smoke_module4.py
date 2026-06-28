"""Module 4 backend smoke — exercises addresses + order lifecycle services.

Run from backend/ with:
    source /home/wang-lin/miniforge3/etc/profile.d/conda.sh && conda activate pccraft
    python scripts/smoke_module4.py

Covers (9 scenarios):
  1. Product effective price = discounted_price
  2. First address auto-default
  3. Second address NOT default (default-toggle logic)
  4. Empty cart rejected
  5. Order placement: total, unit price, stock decrement, cart cleared
  6. Order cancel: stock restored
  7. Forward-only item status flow (CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED)
  8. Backward transition rejected
  9. Wrong-vendor transition rejected
 10. Vendor sees their orders via list_for_vendor
"""
import os
import sys
import uuid
from decimal import Decimal

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import transaction
from django.core.exceptions import ValidationError  # parent of DRF's, catches both

from apps.accounts.models import CustomUser, VendorProfile, UserRole
from apps.products.models import Product, Category, Brand, ProductStatus
from apps.orders.models import OrderStatus, OrderItemStatus
from apps.orders.services import OrderService, AddressService
from apps.cart.models import Cart, CartItem


def _expect(cond, msg):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)


def _mk_vendor(suffix):
    user = CustomUser.objects.create_user(
        email=f"vend_{suffix}@x.com",
        password="p",
        full_name="Test Vend",
        role=UserRole.VENDOR,
    )
    return VendorProfile.objects.create(
        user=user,
        business_name=f"BvCo{suffix}",
        store_name=f"store-{suffix}",
        owner_name="V",
        trade_license_number=f"TL{suffix}",
        nid_number=f"NID{suffix}",
    )


def _mk_product(vendor, suffix):
    cat, _ = Category.objects.get_or_create(slug=f"c-{suffix}", defaults={"name": f"C{suffix}"})
    brand, _ = Brand.objects.get_or_create(slug=f"b-{suffix}", defaults={"name": f"B{suffix}"})
    return Product.objects.create(
        vendor=vendor,
        category=cat,
        brand=brand,
        name=f"P{suffix}",
        slug=f"p-{suffix}",
        sku=f"SKU{suffix}",
        base_price=Decimal("1000.00"),
        discounted_price=Decimal("800.00"),
        stock_quantity=10,
        status=ProductStatus.ACTIVE,
    )


def _address_data(label, phone):
    return {
        "label": label,
        "full_name": "Test Cust",
        "phone": phone,
        "street_address": "123 Main St",
        "address_line2": "",
        "city": "Dhaka",
        "district": "Dhaka",
        "postal_code": "1207",
    }


def main():
    print("=== MODULE 4 SMOKE ===")
    suffix = uuid.uuid4().hex[:6]

    with transaction.atomic():
        customer = CustomUser.objects.create_user(
            email=f"cust_{suffix}@x.com", password="p", full_name="Test Cust"
        )
        vendor = _mk_vendor(suffix)
        product = _mk_product(vendor, suffix)

    _expect(product.effective_price == Decimal("800.00"), f"effective_price={product.effective_price}")
    print(f"OK: Product eff_price={product.effective_price}")

    with transaction.atomic():
        addr = AddressService.create_address(user=customer, data=_address_data("Home", "+8801712345678"))
    _expect(addr.is_default, "first address should be default")
    print(f"OK: address {addr.id} default={addr.is_default}")

    with transaction.atomic():
        addr2 = AddressService.create_address(
            user=customer, data=_address_data("Office", "+8801712345679")
        )
    _expect(not addr2.is_default, "second address should NOT be default")
    print("OK: address default logic")

    cart = Cart.objects.create(user=customer)

    # 4. Empty cart rejected
    try:
        OrderService.create_order_from_cart(user=customer, address_id=str(addr.id))
        _expect(False, "empty cart should have raised")
    except ValidationError as e:
        print(f"OK: empty cart rejected ({e.messages})")

    # 5. Place order with stock decrement + cart clear
    CartItem.objects.create(cart=cart, product=product, quantity=2)
    order = OrderService.create_order_from_cart(user=customer, address_id=str(addr.id))
    _expect(order.total == Decimal("1600.00"), f"total={order.total}")
    item = order.items.first()
    _expect(item.unit_price == Decimal("800.00"), f"unit_price={item.unit_price}")
    product.refresh_from_db()
    _expect(product.stock_quantity == 8, f"stock={product.stock_quantity}")
    print(f"OK: order {order.order_number} total={order.total} stock={product.stock_quantity}")

    # 6. Cancel restores stock
    OrderService.cancel_order(order_id=str(order.id), user=customer)
    order.refresh_from_db()
    product.refresh_from_db()
    _expect(order.status == OrderStatus.CANCELLED, f"status={order.status}")
    _expect(product.stock_quantity == 10, f"stock restored? {product.stock_quantity}")
    print(f"OK: cancel -> stock={product.stock_quantity}")

    # 7. Forward-only item status flow
    CartItem.objects.create(cart=cart, product=product, quantity=1)
    order2 = OrderService.create_order_from_cart(user=customer, address_id=str(addr.id))
    oi = order2.items.first()
    for st in [OrderItemStatus.PROCESSING, OrderItemStatus.SHIPPED, OrderItemStatus.DELIVERED]:
        OrderService.update_item_status(
            item_id=str(oi.id), vendor_profile=vendor, new_status=st
        )
    oi.refresh_from_db()
    _expect(oi.item_status == OrderItemStatus.DELIVERED, f"item_status={oi.item_status}")
    _expect(oi.delivered_at is not None, "delivered_at should be set")
    print(f"OK: forward flow -> DELIVERED at {oi.delivered_at}")

    # 8. Backward transition rejected
    try:
        OrderService.update_item_status(
            item_id=str(oi.id),
            vendor_profile=vendor,
            new_status=OrderItemStatus.CONFIRMED,
        )
        _expect(False, "backward should have raised")
    except ValidationError as e:
        print(f"OK: backward rejected ({e.messages})")

    # 9. Wrong-vendor transition rejected
    other_vendor = _mk_vendor("w" + suffix)
    try:
        OrderService.update_item_status(
            item_id=str(oi.id),
            vendor_profile=other_vendor,
            new_status=OrderItemStatus.CONFIRMED,
        )
        _expect(False, "wrong vendor should have raised")
    except ValidationError as e:
        print(f"OK: wrong vendor rejected ({e.messages})")

    # 10. Vendor sees their orders
    vendor_orders = OrderService.list_for_vendor(vendor_profile=vendor)
    _expect(len(vendor_orders) >= 2, f"vendor saw {len(vendor_orders)} orders, expected >=2")
    print(f"OK: vendor sees {len(vendor_orders)} orders")

    print("=== ALL SMOKE TESTS PASSED ===")


if __name__ == "__main__":
    main()
