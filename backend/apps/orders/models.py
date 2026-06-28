"""Order domain models -- Module 4 (per spec sec. "MODULE 4 -- Order System").

Three concrete models:

* ``ShippingAddress`` -- per-user address book entry.  Owned by this app
  even though only ``Order`` references it directly today; it exists
  here so ``accounts.CustomerProfile.default_shipping_address`` can FK
  to it without an ``accounts`` <-> ``orders`` circular dependency.

* ``Order`` -- the buyer's purchase.  Status flows::

      PENDING_PAYMENT -> CONFIRMED -> PROCESSING -> SHIPPED
                        -> OUT_FOR_DELIVERY -> DELIVERED
                        -> CANCELLED
                        -> RETURN_REQUESTED -> RETURNED

  The shipping address is *snapshotted* into a JSONField at order time
  (see ``OrderService.create_order_from_cart``) so historical orders
  keep the same address text even if the buyer edits their address
  book later.

* ``OrderItem`` -- one row per product in the order.  Each item also
  tracks the vendor it was bought from (denormalised from
  ``Product.vendor``) so vendor dashboards can filter to "their" items
  with a single index hit.
"""
from __future__ import annotations

import uuid

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from apps.accounts.models import CustomUser, VendorProfile
from apps.common.models import TimeStampedModel
from apps.products.models import Product


# ---------------------------------------------------------------------------
# Status enums
# ---------------------------------------------------------------------------
class OrderStatus(models.TextChoices):
    """Top-level order status.  Controlled by the platform / customer."""

    PENDING_PAYMENT = "PENDING_PAYMENT", "Pending Payment"
    CONFIRMED = "CONFIRMED", "Confirmed"
    PROCESSING = "PROCESSING", "Processing"
    SHIPPED = "SHIPPED", "Shipped"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Out for Delivery"
    DELIVERED = "DELIVERED", "Delivered"
    CANCELLED = "CANCELLED", "Cancelled"
    RETURN_REQUESTED = "RETURN_REQUESTED", "Return Requested"
    RETURNED = "RETURNED", "Returned"


class OrderItemStatus(models.TextChoices):
    """Vendor-controlled per-item lifecycle.

    Forward-only progression (enforced in ``OrderService.update_item_status``)::

        CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED
    """

    CONFIRMED = "CONFIRMED", "Confirmed"
    PROCESSING = "PROCESSING", "Processing"
    SHIPPED = "SHIPPED", "Shipped"
    DELIVERED = "DELIVERED", "Delivered"
    CANCELLED = "CANCELLED", "Cancelled"


class PaymentStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PAID = "PAID", "Paid"
    FAILED = "FAILED", "Failed"
    REFUNDED = "REFUNDED", "Refunded"


class PaymentMethod(models.TextChoices):
    COD = "COD", "Cash on Delivery"
    BKASH = "BKASH", "bKash"
    NAGAD = "NAGAD", "Nagad"
    CARD = "CARD", "Card"


# Status guards used in services.
CANCELLABLE_ORDER_STATUSES = {OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED}
"""Statuses from which the customer (or system) may cancel an order."""


# ---------------------------------------------------------------------------
# ShippingAddress
# ---------------------------------------------------------------------------
class ShippingAddress(TimeStampedModel):
    """Per-user address book entry.

    Spec fields (``MODULE 4 -- Backend Tasks``):

    ``full_name``, ``phone``, ``street_address``, ``city``, ``district``,
    ``postal_code``, ``country`` (default='BD'), ``is_default``.

    A ``save()`` override enforces "at most one default address per user":
    if a row is saved with ``is_default=True`` all sibling rows for the
    same user have their flag cleared in the same transaction.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="shipping_addresses",
        related_query_name="shipping_address",
    )

    label = models.CharField(
        max_length=80,
        blank=True,
        default="Home",
        help_text="Friendly tag, e.g. 'Home', 'Office'.",
    )
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    street_address = models.CharField(
        max_length=255,
        help_text="House + road; the primary delivery line.",
    )
    address_line2 = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional secondary line (apartment, floor, etc.).",
    )
    city = models.CharField(max_length=80)
    district = models.CharField(max_length=80)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=80, default="Bangladesh")
    is_default = models.BooleanField(default=False, db_index=True)

    class Meta:
        verbose_name = "Shipping Address"
        verbose_name_plural = "Shipping Addresses"
        ordering = ("-is_default", "-updated_at")
        indexes = [
            models.Index(fields=("user", "is_default")),
        ]

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        return "%s -- %s, %s" % (self.full_name, self.city, self.country)

    # -- helpers ---------------------------------------------------------
    def save(self, *args, **kwargs):
        """Enforce single-default invariant per user."""
        if self.is_default:
            # Clear any other default row for this user. We do this in the
            # same transaction so a failed save() leaves no half-state.
            (
                ShippingAddress.objects
                .filter(user_id=self.user_id, is_default=True)
                .exclude(pk=self.pk)
                .update(is_default=False)
            )
        super().save(*args, **kwargs)

    def to_snapshot(self) -> dict:
        """Serialise the address into the JSON payload stored on Order."""
        return {
            "address_id": str(self.pk),
            "label": self.label,
            "full_name": self.full_name,
            "phone": self.phone,
            "street_address": self.street_address,
            "address_line2": self.address_line2,
            "city": self.city,
            "district": self.district,
            "postal_code": self.postal_code,
            "country": self.country,
        }


# ---------------------------------------------------------------------------
# Order
# ---------------------------------------------------------------------------
class Order(TimeStampedModel):
    """A buyer's purchase.

    ``order_number`` is the human-facing identifier
    (``PCM-YYYYMMDD-NNNNN``) and is unique.  The internal ``id`` stays
    a UUID so it never leaks order volume.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.PROTECT,
        related_name="orders",
        related_query_name="order",
    )
    order_number = models.CharField(
        max_length=32,
        unique=True,
        db_index=True,
        help_text="PCM-YYYYMMDD-NNNNN -- set by OrderService.generate_order_number",
    )

    status = models.CharField(
        max_length=32,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING_PAYMENT,
        db_index=True,
    )
    payment_status = models.CharField(
        max_length=16,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
        db_index=True,
    )
    payment_method = models.CharField(
        max_length=16,
        choices=PaymentMethod.choices,
        default=PaymentMethod.COD,
    )

    # Money -- all Decimal(12,2).  Stored as strings in JSON; we compute
    # the totals in ``OrderService.create_order_from_cart``.
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Frozen copy of the shipping address at order time.
    shipping_address_snapshot = models.JSONField(
        default=dict,
        help_text="Output of ShippingAddress.to_snapshot() at order time.",
    )

    notes = models.TextField(blank=True, default="")
    delivery_partner = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text="Optional FK-friendly string for the courier; left blank for now.",
    )
    tracking_number = models.CharField(max_length=120, blank=True, default="")

    cancelled_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Order"
        verbose_name_plural = "Orders"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("user", "-created_at")),
            models.Index(fields=("status", "-created_at")),
            models.Index(fields=("payment_status", "-created_at")),
        ]

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        return "%s (%s)" % (self.order_number, self.status)

    # -- computed display helpers ---------------------------------------
    @property
    def item_count(self) -> int:
        return sum(item.quantity for item in self.items.all())

    @property
    def can_cancel(self) -> bool:
        return self.status in {s.value for s in CANCELLABLE_ORDER_STATUSES}


# ---------------------------------------------------------------------------
# OrderItem
# ---------------------------------------------------------------------------
class OrderItem(TimeStampedModel):
    """One line in an Order -- one row per product purchased.

    Per spec critical design decisions:

    * ``unit_price`` is captured at order time from
      ``Product.effective_price`` and **never updated** -- even if the
      product price changes later the historical record stays correct.
    * ``product_name_snapshot`` and ``discount_snapshot`` follow the
      same rule.
    * ``product`` uses ``on_delete=SET_NULL`` so deleting a product
      does not lose the order history.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="items",
        related_query_name="item",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_items",
    )
    vendor = models.ForeignKey(
        VendorProfile,
        on_delete=models.PROTECT,
        related_name="order_items",
        help_text="Denormalised from Product.vendor at order time.",
    )

    product_name_snapshot = models.CharField(max_length=255)
    product_slug_snapshot = models.CharField(max_length=255, blank=True, default="")
    primary_image_url = models.URLField(blank=True, default="")

    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Effective price at the moment of order.",
    )
    discount_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Total discount applied at order time (BDT).",
    )
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
    )
    item_status = models.CharField(
        max_length=20,
        choices=OrderItemStatus.choices,
        default=OrderItemStatus.CONFIRMED,
        db_index=True,
    )

    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Order item"
        verbose_name_plural = "Order items"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("order",)),
            models.Index(fields=("vendor", "-created_at")),
            models.Index(fields=("vendor", "item_status")),
        ]

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        return "%s x %s @ %s" % (
            self.quantity,
            self.product_name_snapshot,
            self.unit_price,
        )

    # -- computed display helpers ---------------------------------------
    @property
    def line_total(self):
        """quantity * unit_price, snapshot-accurate."""
        from decimal import Decimal

        return self.quantity * self.unit_price

    @property
    def can_return(self) -> bool:
        """True if this item is still inside the 7-day return window.

        Per spec §5 a return is only allowed when:

        * the item is in ``DELIVERED`` status, AND
        * ``delivered_at`` (or, as a fallback, ``order.delivered_at``) is
          no more than 7 days ago.
        """
        from datetime import timedelta

        if self.item_status != OrderItemStatus.DELIVERED:
            return False
        delivered_at = self.delivered_at or self.order.delivered_at
        if delivered_at is None:
            return False
        now = timezone.now()
        return (now - delivered_at) <= timedelta(days=RETURN_WINDOW_DAYS)


# Number of days a delivered item is eligible for return -- spec §5.
RETURN_WINDOW_DAYS = 7


# ===========================================================================
# Module 5 — Returns & Refunds
# ===========================================================================
class ReturnReason(models.TextChoices):
    """Why a customer is asking for a return."""

    DAMAGED = "DAMAGED", "Damaged"
    NOT_AS_DESCRIBED = "NOT_AS_DESCRIBED", "Not as described"
    WRONG_ITEM = "WRONG_ITEM", "Wrong item received"
    DEFECTIVE = "DEFECTIVE", "Defective on arrival"
    MISSING_PARTS = "MISSING_PARTS", "Missing parts or accessories"


class ReturnStatus(models.TextChoices):
    """7-step return lifecycle per Module 5 spec.

    Forward-only progression enforced by ``ReturnService``::

        PENDING -> APPROVED -> SHIPPED_BACK -> RECEIVED
                -> REFUND_INITIATED -> REFUNDED
        (any non-terminal) -> REJECTED (terminal, except REJECTED itself)
    """

    PENDING = "PENDING", "Pending review"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    SHIPPED_BACK = "SHIPPED_BACK", "Shipped back"
    RECEIVED = "RECEIVED", "Received by vendor"
    REFUND_INITIATED = "REFUND_INITIATED", "Refund initiated"
    REFUNDED = "REFUNDED", "Refunded"


# Terminal statuses -- no further transitions allowed.
_TERMINAL_RETURN_STATUSES = frozenset({
    ReturnStatus.REJECTED,
    ReturnStatus.REFUNDED,
})


class ReturnRequest(TimeStampedModel):
    """A single return request tied to one ``OrderItem``.

    Per spec:

    * ``OneToOneField`` to ``OrderItem`` -- the DB itself forbids two
      open returns for the same item.
    * Status is one of the seven ``ReturnStatus`` choices above.
    * Every transition has a paired timestamp (``approved_at``,
      ``rejected_at``, ``shipped_back_at``, ``received_at``,
      ``refund_initiated_at``, ``refunded_at``) -- all nullable so
      pending rows can be created in one shot.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order_item = models.OneToOneField(
        OrderItem,
        on_delete=models.CASCADE,
        related_name="return_request",
        related_query_name="return_request",
        help_text="One return per item -- enforced at the DB level.",
    )
    customer = models.ForeignKey(
        CustomUser,
        on_delete=models.PROTECT,
        related_name="return_requests",
        related_query_name="return_request",
        help_text="The buyer who initiated the return.",
    )

    return_number = models.CharField(
        max_length=32,
        unique=True,
        db_index=True,
        help_text="RET-YYYYMMDD-NNNNN -- set by ReturnService.generate_return_number",
    )

    reason = models.CharField(
        max_length=32,
        choices=ReturnReason.choices,
        default=ReturnReason.DAMAGED,
        db_index=True,
    )
    description = models.TextField(
        help_text="Free-form customer explanation. Min 20 chars per spec.",
    )

    status = models.CharField(
        max_length=32,
        choices=ReturnStatus.choices,
        default=ReturnStatus.PENDING,
        db_index=True,
    )
    rejection_reason = models.TextField(
        blank=True, default="",
        help_text="Filled when the vendor rejects the request.",
    )
    tracking_number_return = models.CharField(
        max_length=120,
        blank=True, default="",
        help_text="Customer's tracking number for the return shipment.",
    )
    vendor_notes = models.TextField(blank=True, default="")
    admin_notes = models.TextField(blank=True, default="")

    # Status timestamps -- all nullable so a brand-new request has none set.
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    shipped_back_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    refund_initiated_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Return request"
        verbose_name_plural = "Return requests"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("customer", "-created_at")),
            models.Index(fields=("status", "-created_at")),
            models.Index(fields=("order_item",)),
        ]

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        return "%s (%s)" % (self.return_number, self.status)

    # -- computed display helpers ---------------------------------------
    @property
    def is_terminal(self) -> bool:
        """True once no further vendor/admin action is possible."""
        return self.status in _TERMINAL_RETURN_STATUSES

    @property
    def can_ship_back(self) -> bool:
        """Customer may submit a return tracking number."""
        return self.status == ReturnStatus.APPROVED


class ReturnEvidence(TimeStampedModel):
    """A single photo attached to a ``ReturnRequest``.

    Up to four evidence images per request -- enforced in
    ``ReturnService.initiate_return``.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    return_request = models.ForeignKey(
        ReturnRequest,
        on_delete=models.CASCADE,
        related_name="evidence",
        related_query_name="evidence",
    )
    image = models.ImageField(
        upload_to="returns/evidence/%Y/%m/",
        help_text="Stored under MEDIA_ROOT/returns/evidence/YYYY/MM/.",
    )
    caption = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        verbose_name = "Return evidence"
        verbose_name_plural = "Return evidence"
        ordering = ("created_at",)

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        return "evidence<%s>" % self.pk


class ReturnSequence(TimeStampedModel):
    """Monotonic counter for ``ReturnRequest.return_number``.

    Holds exactly one row (``pk=1``).  ``ReturnService.generate_return_number``
    locks it with ``select_for_update`` to serialise concurrent return
    creation, sidestepping the cross-join ``FOR UPDATE`` restriction that
    Django imposes when locking a queryset that contains joined tables.
    """

    id = models.IntegerField(primary_key=True)
    last_value = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Return number sequence"
        verbose_name_plural = "Return number sequence"

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        return "ReturnSequence(last=%d)" % self.last_value
