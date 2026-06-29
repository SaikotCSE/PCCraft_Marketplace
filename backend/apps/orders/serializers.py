"""Serializers for the orders app -- Module 4.

* ``ShippingAddressSerializer`` -- full address shape + create/update.
* ``OrderItemSerializer`` -- one line in an order; vendor name + status
  + computed ``line_total`` for the frontend.
* ``OrderSerializer`` -- the buyer's order: items + address snapshot
  + status + totals + can_cancel/can_return helpers.
* ``OrderCreateSerializer`` -- payload validator for ``POST /orders/``.
* ``OrderItemStatusUpdateSerializer`` -- vendor's PATCH payload.
"""
from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.orders.models import (
    Order,
    OrderItem,
    OrderItemStatus,
    OrderStatus,
    PaymentMethod,
    RETURN_WINDOW_DAYS,
    ReturnEvidence,
    ReturnReason,
    ReturnRequest,
    ReturnStatus,
    ShippingAddress,
)
from apps.products.models import Product


# ---------------------------------------------------------------------------
# ShippingAddress
# ---------------------------------------------------------------------------
class ShippingAddressSerializer(serializers.ModelSerializer):
    """Read+write serializer for ``ShippingAddress``."""

    class Meta:
        model = ShippingAddress
        fields = (
            "id",
            "label",
            "full_name",
            "phone",
            "street_address",
            "address_line2",
            "city",
            "district",
            "postal_code",
            "country",
            "is_default",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_phone(self, value: str) -> str:
        """Light sanity check -- spec accepts any BD-format phone."""
        cleaned = (value or "").strip()
        if len(cleaned) < 7:
            raise serializers.ValidationError("Phone number looks too short.")
        return cleaned


# ---------------------------------------------------------------------------
# OrderItem
# ---------------------------------------------------------------------------
class OrderItemSerializer(serializers.ModelSerializer):
    """One line in an order."""

    product_id = serializers.SerializerMethodField()
    product_slug = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()
    vendor_name = serializers.SerializerMethodField()
    vendor_id = serializers.SerializerMethodField()
    can_return = serializers.SerializerMethodField()
    days_to_return_close = serializers.SerializerMethodField()
    return_request_id = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = (
            "id",
            "product_id",
            "product_slug",
            "product_name_snapshot",
            "primary_image_url",
            "vendor_id",
            "vendor_name",
            "unit_price",
            "discount_snapshot",
            "quantity",
            "line_total",
            "item_status",
            "shipped_at",
            "delivered_at",
            "can_return",
            "days_to_return_close",
            "return_request_id",
            "created_at",
        )
        read_only_fields = fields

    def get_product_id(self, obj: OrderItem):
        return str(obj.product_id) if obj.product_id else None

    def get_product_slug(self, obj: OrderItem):
        if obj.product_id and obj.product and getattr(obj.product, "slug", None):
            return obj.product.slug
        return obj.product_slug_snapshot or ""

    def get_line_total(self, obj: OrderItem):
        return str(obj.line_total)

    def get_vendor_name(self, obj: OrderItem):
        return obj.vendor.store_name if obj.vendor_id else ""

    def get_vendor_id(self, obj: OrderItem):
        return str(obj.vendor_id) if obj.vendor_id else None

    def get_can_return(self, obj: OrderItem):
        return bool(obj.can_return)

    def get_days_to_return_close(self, obj: OrderItem):
        """Days remaining until the return window closes.

        Returns ``0`` when the item is not eligible (delivered, but the
        window already closed), and ``None`` when the item has not been
        delivered yet (so the UI can decide whether to show "Not yet
        eligible").
        """
        delivered_at = obj.delivered_at or (
            obj.order.delivered_at if obj.order_id else None
        )
        if obj.item_status != OrderItemStatus.DELIVERED or delivered_at is None:
            return None
        from django.utils import timezone
        delta = timezone.now() - delivered_at
        remaining = RETURN_WINDOW_DAYS - delta.days
        return max(0, remaining)

    def get_return_request_id(self, obj: OrderItem):
        """FK from the order item to its (unique) ``ReturnRequest``, if any."""
        rr = getattr(obj, "return_request", None)
        if rr is None:
            return None
        return str(rr.pk)


# ---------------------------------------------------------------------------
# Order
# ---------------------------------------------------------------------------
class OrderSerializer(serializers.ModelSerializer):
    """Read serializer for ``Order``.

    Exposes a flat ``status`` enum string (matching the spec) plus
    embedded ``items`` and a ``can_cancel`` boolean the frontend uses
    to render the Cancel button without an extra round-trip.
    """

    items = OrderItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)
    can_cancel = serializers.BooleanField(read_only=True)
    shipping_address = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "status",
            "payment_status",
            "payment_method",
            "subtotal",
            "shipping_fee",
            "tax",
            "discount",
            "total",
            "notes",
            "tracking_number",
            "shipping_address",
            "items",
            "item_count",
            "can_cancel",
            "cancelled_at",
            "confirmed_at",
            "shipped_at",
            "delivered_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_shipping_address(self, obj: Order):
        """Return the frozen snapshot from order time.

        This is intentionally a dict, not a nested serializer -- the
        snapshot is a point-in-time copy and the user may have edited
        their address book since.
        """
        return obj.shipping_address_snapshot or {}


# ---------------------------------------------------------------------------
# POST /orders/ payload
# ---------------------------------------------------------------------------
class OrderCreateSerializer(serializers.Serializer):
    """Validate the ``POST /api/v1/orders/`` body."""

    address_id = serializers.PrimaryKeyRelatedField(
        queryset=ShippingAddress.objects.all(),
    )
    notes = serializers.CharField(
        required=False, allow_blank=True, default="",
        max_length=500,
    )

    def validate_address_id(self, value: ShippingAddress):
        request = self.context.get("request")
        if request is None or value.user_id != request.user.pk:
            raise serializers.ValidationError("Address does not belong to you.")
        return value


# ---------------------------------------------------------------------------
# Vendor PATCH payload
# ---------------------------------------------------------------------------
class OrderItemStatusUpdateSerializer(serializers.Serializer):
    """Validate the vendor's PATCH on ``/vendor/orders/items/{id}/status/``."""

    status = serializers.ChoiceField(
        choices=OrderItemStatus.choices,
    )
    tracking_number = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=120,
    )

    def validate_status(self, value: str) -> str:
        return value


# ---------------------------------------------------------------------------
# Module 5 -- Returns & Refunds serializers
# ---------------------------------------------------------------------------
class ReturnEvidenceSerializer(serializers.ModelSerializer):
    """Read-only view of a single ``ReturnEvidence`` row.

    ``image_url`` is computed so the frontend can render the gallery
    without re-implementing ``MEDIA_URL`` joining.
    """

    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ReturnEvidence
        fields = (
            "id",
            "image",
            "image_url",
            "caption",
            "created_at",
        )
        read_only_fields = fields

    def get_image_url(self, obj: ReturnEvidence):
        try:
            request = self.context.get("request")
            url = obj.image.url
            if request is not None:
                return request.build_absolute_uri(url)
            return url
        except (ValueError, AttributeError):
            return ""


class ReturnRequestSerializer(serializers.ModelSerializer):
    """Read-only full view of a ``ReturnRequest``.

    Includes the embedded evidence gallery (via
    ``ReturnEvidenceSerializer``), the order number, vendor and product
    summaries so the buyer/vendor/admin tables can render without extra
    round-trips.
    """

    evidence = ReturnEvidenceSerializer(many=True, read_only=True)
    reason_label = serializers.CharField(source="get_reason_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    order_number = serializers.SerializerMethodField()
    order_id = serializers.SerializerMethodField()
    order_item_id = serializers.SerializerMethodField()
    vendor_id = serializers.SerializerMethodField()
    vendor_name = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    product_image_url = serializers.SerializerMethodField()
    unit_price = serializers.SerializerMethodField()
    quantity = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()
    customer_id = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()

    class Meta:
        model = ReturnRequest
        fields = (
            "id",
            "return_number",
            "order_number",
            "order_id",
            "order_item_id",
            "vendor_id",
            "vendor_name",
            "product_name",
            "product_image_url",
            "unit_price",
            "quantity",
            "line_total",
            "reason",
            "reason_label",
            "description",
            "status",
            "status_label",
            "rejection_reason",
            "tracking_number_return",
            "vendor_notes",
            "admin_notes",
            "approved_at",
            "rejected_at",
            "shipped_back_at",
            "received_at",
            "refund_initiated_at",
            "refunded_at",
            "customer_id",
            "customer_name",
            "customer_email",
            "evidence",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    # -- item/voucher context ------------------------------------------
    def _item(self, obj: ReturnRequest):
        return getattr(obj, "order_item", None)

    def get_order_number(self, obj: ReturnRequest):
        item = self._item(obj)
        return item.order.order_number if item and item.order_id else ""

    def get_order_id(self, obj: ReturnRequest):
        item = self._item(obj)
        return str(item.order_id) if item and item.order_id else None

    def get_order_item_id(self, obj: ReturnRequest):
        item = self._item(obj)
        return str(item.pk) if item else None

    def get_vendor_id(self, obj: ReturnRequest):
        item = self._item(obj)
        return str(item.vendor_id) if item and item.vendor_id else None

    def get_vendor_name(self, obj: ReturnRequest):
        item = self._item(obj)
        return item.vendor.store_name if item and item.vendor_id else ""

    def get_product_name(self, obj: ReturnRequest):
        item = self._item(obj)
        return item.product_name_snapshot if item else ""

    def get_product_image_url(self, obj: ReturnRequest):
        item = self._item(obj)
        return item.primary_image_url if item else ""

    def get_unit_price(self, obj: ReturnRequest):
        item = self._item(obj)
        return str(item.unit_price) if item else "0.00"

    def get_quantity(self, obj: ReturnRequest):
        item = self._item(obj)
        return item.quantity if item else 0

    def get_line_total(self, obj: ReturnRequest):
        item = self._item(obj)
        return str(item.line_total) if item else "0.00"

    # -- customer context ----------------------------------------------
    def get_customer_id(self, obj: ReturnRequest):
        return str(obj.customer_id) if obj.customer_id else None

    def get_customer_name(self, obj: ReturnRequest):
        if obj.customer_id:
            full = (obj.customer.full_name or "").strip()
            # Auth is email-based (Module 1) -- ``CustomUser`` has no
            # ``username`` column. Fall back to the email prefix when the
            # customer has not supplied a full name yet.
            if full:
                return full
            email = obj.customer.email or ""
            return email.split("@", 1)[0] if email else ""
        return ""

    def get_customer_email(self, obj: ReturnRequest):
        return obj.customer.email if obj.customer_id else ""


class ReturnRequestCreateSerializer(serializers.Serializer):
    """Validate the ``POST /orders/items/{id}/return/`` payload.

    Images come through as multipart ``images`` files (up to 4) -- those
    aren't validated here; the service layer enforces the count limit
    because the spec says "up to 4".
    """

    reason = serializers.ChoiceField(choices=ReturnReason.choices)
    description = serializers.CharField(
        max_length=2000,
        trim_whitespace=True,
        help_text="Free-form customer explanation (min 20 chars).",
    )

    def validate_description(self, value: str) -> str:
        cleaned = (value or "").strip()
        if len(cleaned) < 20:
            raise serializers.ValidationError(
                "Description must be at least 20 characters."
            )
        return cleaned


class VendorReturnReviewSerializer(serializers.Serializer):
    """Payload for ``PATCH /vendor/returns/{id}/review/``.

    ``action`` is either ``approve`` (notes optional) or ``reject``
    (reason required, min 5 chars).
    """

    action = serializers.ChoiceField(choices=("approve", "reject"))
    reason = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000,
    )
    vendor_notes = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000,
    )

    def validate(self, attrs: dict) -> dict:
        if attrs.get("action") == "reject":
            reason = (attrs.get("reason") or "").strip()
            if len(reason) < 5:
                raise serializers.ValidationError({
                    "reason": "Rejection reason must be at least 5 characters.",
                })
            attrs["reason"] = reason
        return attrs


class CustomerShipBackSerializer(serializers.Serializer):
    """Payload for ``POST /returns/{id}/ship-back/``."""

    tracking_number = serializers.CharField(
        max_length=120,
        trim_whitespace=True,
    )

    def validate_tracking_number(self, value: str) -> str:
        cleaned = (value or "").strip()
        if len(cleaned) < 3:
            raise serializers.ValidationError(
                "Tracking number looks too short (min 3 chars)."
            )
        return cleaned


class AdminReturnActionSerializer(serializers.Serializer):
    """Payload for the admin actions on ``/admin/returns/{id}/...``.

    Both ``process_refund`` and ``confirm_refund`` accept an optional
    ``admin_notes`` field (saved inline).
    """

    admin_notes = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000,
    )


# Re-exports for convenience.
__all__ = [
    "ShippingAddressSerializer",
    "OrderItemSerializer",
    "OrderSerializer",
    "OrderCreateSerializer",
    "OrderItemStatusUpdateSerializer",
    "ReturnEvidenceSerializer",
    "ReturnRequestSerializer",
    "ReturnRequestCreateSerializer",
    "VendorReturnReviewSerializer",
    "CustomerShipBackSerializer",
    "AdminReturnActionSerializer",
    "OrderStatus",
    "OrderItemStatus",
    "PaymentMethod",
    "ReturnStatus",
    "ReturnReason",
]  # pragma: no cover