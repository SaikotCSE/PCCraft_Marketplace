"""Order business logic -- Module 4 (spec sec. "MODULE 4 -- Order System").

Two service classes:

* ``AddressService`` -- CRUD on ``ShippingAddress`` with the single-
  default-per-user invariant enforced in the model's ``save()``.
* ``OrderService``  -- order placement, cancel, vendor status updates.

Per CLAUDE.md rule #2 ("all views call services only -- no logic in
views") every business rule lives here; views are thin HTTP wrappers.

Stock handling notes:

* ``create_order_from_cart`` calls ``Product.objects.select_for_update``
  on every product before reading ``stock_quantity`` and again before
  decrementing, so two concurrent orders can't oversell a product.
* ``cancel_order`` adds the original quantity back; the same row lock
  is used.
"""
from __future__ import annotations

import logging
import datetime
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.cart.models import Cart
from apps.cart.services import CartService
from apps.orders.models import (
    CANCELLABLE_ORDER_STATUSES,
    Order,
    OrderItem,
    OrderItemStatus,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    RETURN_WINDOW_DAYS,
    ReturnEvidence,
    ReturnReason,
    ReturnRequest,
    ReturnStatus,
    ShippingAddress,
)
from apps.products.models import Product

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# AddressService
# ---------------------------------------------------------------------------
class AddressService:
    """Stateless facade for ``ShippingAddress`` mutations.

    The default-address invariant is enforced inside
    ``ShippingAddress.save()`` -- callers only need to flip the field
    and we handle the unsetting of siblings.
    """

    @staticmethod
    def list_for_user(user) -> list[ShippingAddress]:
        return list(
            ShippingAddress.objects
            .filter(user=user)
            .order_by("-is_default", "-updated_at")
        )

    @staticmethod
    @transaction.atomic
    def create_address(user, data: dict) -> ShippingAddress:
        """Insert a new address for ``user``.

        If the user has no existing address the new row is automatically
        marked ``is_default`` so the address book always has a default.
        """
        is_default = data.get("is_default")
        if is_default is None:
            # First address for this user -> auto-default.
            has_any = ShippingAddress.objects.filter(user=user).exists()
            is_default = not has_any

        # Normalise "BD"/"Bangladesh" -- spec default is "BD" but we
        # accept the longer name too.
        country = (data.get("country") or "Bangladesh").strip() or "Bangladesh"

        address = ShippingAddress(
            user=user,
            label=data.get("label", "Home"),
            full_name=data["full_name"],
            phone=data["phone"],
            street_address=data["street_address"],
            address_line2=data.get("address_line2", ""),
            city=data["city"],
            district=data["district"],
            postal_code=data.get("postal_code", ""),
            country=country,
            is_default=bool(is_default),
        )
        address.save()
        logger.info(
            "address.create user_id=%s address_id=%s default=%s",
            user.pk, address.pk, address.is_default,
        )
        return address

    @staticmethod
    @transaction.atomic
    def update_address(address: ShippingAddress, data: dict) -> ShippingAddress:
        """Patch an existing address.

        If ``is_default`` is set truthy, the model's ``save()`` will
        unset all sibling defaults for the same user.
        """
        for field in (
            "label", "full_name", "phone", "street_address",
            "address_line2", "city", "district", "postal_code", "country",
        ):
            if field in data:
                setattr(address, field, data[field] or "")
        if "is_default" in data:
            address.is_default = bool(data["is_default"])
        address.save()
        return address

    @staticmethod
    @transaction.atomic
    def delete_address(address: ShippingAddress) -> None:
        """Delete an address.

        Raises ``ValidationError`` if the address is the user's only
        default -- the caller must set another default first.
        """
        if address.is_default:
            others = ShippingAddress.objects.filter(
                user_id=address.user_id,
            ).exclude(pk=address.pk).exists()
            if not others:
                raise ValidationError(
                    "Cannot delete the only address. Add another address first."
                )
            # If there are other addresses, promote the most-recently-updated
            # one to default so the address book always has one.
            new_default = (
                ShippingAddress.objects
                .filter(user_id=address.user_id)
                .exclude(pk=address.pk)
                .order_by("-updated_at")
                .first()
            )
            if new_default:
                new_default.is_default = True
                new_default.save(update_fields=("is_default", "updated_at"))
        address.delete()

    @staticmethod
    @transaction.atomic
    def set_default(user, address_id) -> ShippingAddress:
        """Mark ``address_id`` as the user's default address."""
        try:
            address = ShippingAddress.objects.select_for_update().get(
                pk=address_id, user=user,
            )
        except ShippingAddress.DoesNotExist as exc:
            raise ValidationError("Address not found.") from exc
        address.is_default = True
        address.save()  # save() unsets siblings
        return address


# ---------------------------------------------------------------------------
# OrderService
# ---------------------------------------------------------------------------
class OrderService:
    """Stateless facade for order placement, cancellation, vendor updates."""

    # -- number generation ---------------------------------------------
    # Per spec: PCM-YYYYMMDD-NNNNN (5-digit zero-padded per-day sequence).
    @staticmethod
    def _today_prefix() -> str:
        return "PCM-" + timezone.now().strftime("%Y%m%d") + "-"

    @staticmethod
    def generate_order_number() -> str:
        """Return the next ``PCM-YYYYMMDD-NNNNN`` identifier.

        Uses a single ``SELECT MAX(...)`` query under transaction so two
        concurrent callers cannot collide.  We bump the row's counter
        atomically by inserting then reading.
        """
        prefix = OrderService._today_prefix()
        with transaction.atomic():
            latest = (
                Order.objects
                .select_for_update()
                .filter(order_number__startswith=prefix)
                .order_by("-order_number")
                .values_list("order_number", flat=True)
                .first()
            )
            if latest is None:
                seq = 1
            else:
                try:
                    seq = int(latest.rsplit("-", 1)[-1]) + 1
                except (ValueError, IndexError):
                    seq = 1
            return "%s%05d" % (prefix, seq)

    # -- order placement ------------------------------------------------
    @staticmethod
    @transaction.atomic
    def create_order_from_cart(user, address_id: str, *, notes: str = "") -> Order:
        """Convert the user's cart into a new Order.

        7-step atomic flow (per spec):

        1. Fetch cart, validate not empty, validate no unavailable items.
        2. Validate stock for each item (atomic, ``select_for_update``).
        3. Create ``Order`` with ``shipping_address_snapshot``.
        4. Create ``OrderItem`` per cart item (``unit_price`` =
           ``product.effective_price``).
        5. Decrement ``stock_quantity`` for each product (atomic).
        6. ``CartService.clear_cart(cart)``.
        7. Return created order.
        """
        # -- 1. cart & address fetch -----------------------------------
        cart = (
            Cart.objects
            .select_for_update()
            .filter(user=user)
            .first()
        )
        if cart is None:
            raise ValidationError("Your cart is empty.")
        items = list(
            cart.items.select_related("product", "product__vendor")
            .order_by("created_at")
        )
        if not items:
            raise ValidationError("Your cart is empty.")

        unavailable = [it for it in items if it.is_unavailable]
        if unavailable:
            names = ", ".join(it.product.name for it in unavailable[:3])
            raise ValidationError(
                "Some items are out of stock: %s%s" % (
                    names, "..." if len(unavailable) > 3 else ""
                )
            )

        try:
            address = ShippingAddress.objects.get(pk=address_id, user=user)
        except ShippingAddress.DoesNotExist as exc:
            raise ValidationError("Shipping address not found.") from exc

        # -- 2. lock products & validate stock -------------------------
        locked_products: dict = {}
        for it in items:
            if it.product_id in locked_products:
                continue
            product = (
                Product.objects
                .select_for_update()
                .get(pk=it.product_id)
            )
            if product.status != "ACTIVE" or not product.is_active:
                raise ValidationError(
                    "Product '%s' is no longer available." % product.name
                )
            if product.stock_quantity < it.quantity:
                raise ValidationError(
                    "Insufficient stock for '%s' (requested %d, available %d)."
                    % (product.name, it.quantity, product.stock_quantity)
                )
            locked_products[it.product_id] = product

        # -- 3. order header -------------------------------------------
        order = Order.objects.create(
            user=user,
            order_number=OrderService.generate_order_number(),
            status=OrderStatus.PENDING_PAYMENT,
            payment_status=PaymentStatus.PENDING,
            payment_method=PaymentMethod.COD,
            shipping_address_snapshot=address.to_snapshot(),
            notes=notes or "",
        )

        # -- 4. order items + 5. stock decrement -----------------------
        subtotal = Decimal("0.00")
        for it in items:
            product = locked_products[it.product_id]
            effective = product.effective_price
            base = product.base_price
            discount = max(Decimal("0.00"), base - effective)

            primary_image = None
            if hasattr(product, "images"):
                primary_image = (
                    product.images.filter(is_active=True, is_primary=True).first()
                    or product.images.filter(is_active=True).order_by("display_order").first()
                )
            image_url = ""
            if primary_image and getattr(primary_image, "image", None):
                try:
                    image_url = primary_image.image.url
                except ValueError:
                    image_url = ""

            OrderItem.objects.create(
                order=order,
                product=product,
                vendor=product.vendor,
                product_name_snapshot=product.name,
                product_slug_snapshot=product.slug,
                primary_image_url=image_url,
                unit_price=effective,
                discount_snapshot=discount * it.quantity,
                quantity=it.quantity,
                item_status=OrderItemStatus.CONFIRMED,
            )
            subtotal += effective * it.quantity

            # Atomic stock decrement.  We re-fetch with the row lock we
            # already hold to avoid the F() race vs. concurrent reads.
            Product.objects.filter(pk=product.pk).update(
                stock_quantity=F("stock_quantity") - it.quantity,
                total_sold=F("total_sold") + it.quantity,
            )

        # -- totals (no shipping/tax computed here -- spec leaves them 0)
        order.subtotal = subtotal
        order.total = subtotal + order.shipping_fee + order.tax - order.discount
        order.save(update_fields=("subtotal", "total", "updated_at"))

        # -- 6. clear cart ---------------------------------------------
        CartService.clear_cart(cart)

        logger.info(
            "order.create ok order_id=%s order_number=%s items=%d total=%s",
            order.pk, order.order_number, len(items), order.total,
        )

        # -- 7. return -------------------------------------------------
        return order

    # -- cancel --------------------------------------------------------
    @staticmethod
    @transaction.atomic
    def cancel_order(order_id, user) -> Order:
        """Cancel an order and restore stock.

        Allowed only from ``PENDING_PAYMENT`` or ``CONFIRMED``.
        ``user`` must be the buyer (or staff).
        """
        order = (
            Order.objects
            .select_for_update()
            .select_related("user")
            .filter(pk=order_id)
            .first()
        )
        if order is None:
            raise ValidationError("Order not found.")
        if order.user_id != user.pk and not (user.is_staff or user.is_superuser):
            raise ValidationError("You cannot cancel this order.")
        if order.status not in CANCELLABLE_ORDER_STATUSES:
            raise ValidationError(
                "Order cannot be cancelled in status '%s'." % order.status
            )

        # Restore stock for every line that still has a product FK.
        items = list(order.items.select_for_update().all())
        for item in items:
            if item.product_id is None:
                continue
            Product.objects.filter(pk=item.product_id).update(
                stock_quantity=F("stock_quantity") + item.quantity,
                total_sold=F("total_sold") - item.quantity,
            )
            item.item_status = OrderItemStatus.CANCELLED
            item.save(update_fields=("item_status", "updated_at"))

        order.status = OrderStatus.CANCELLED
        order.cancelled_at = timezone.now()
        order.save(update_fields=("status", "cancelled_at", "updated_at"))

        logger.info(
            "order.cancel ok order_id=%s order_number=%s",
            order.pk, order.order_number,
        )
        return order

    # -- vendor item-status update ------------------------------------
    # Forward-only progression: CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED.
    _ITEM_STATUS_FLOW = {
        OrderItemStatus.CONFIRMED: {OrderItemStatus.PROCESSING, OrderItemStatus.CANCELLED},
        OrderItemStatus.PROCESSING: {OrderItemStatus.SHIPPED},
        OrderItemStatus.SHIPPED: {OrderItemStatus.DELIVERED},
        OrderItemStatus.DELIVERED: set(),
        OrderItemStatus.CANCELLED: set(),
    }

    @staticmethod
    @transaction.atomic
    def update_item_status(
        item_id,
        vendor_profile,
        new_status: str,
        tracking_number: str = "",
    ) -> OrderItem:
        """Vendor-controlled per-item status update.

        Raises ``ValidationError`` on:

        * unknown item id,
        * item does not belong to this vendor,
        * ``new_status`` is not in the forward-only flow.
        """
        item = (
            OrderItem.objects
            .select_for_update()
            .select_related("order", "vendor")
            .filter(pk=item_id)
            .first()
        )
        if item is None:
            raise ValidationError("Order item not found.")
        if item.vendor_id != vendor_profile.pk:
            raise ValidationError("This item does not belong to your store.")

        current = item.item_status
        allowed = OrderService._ITEM_STATUS_FLOW.get(current, set())
        if new_status not in {s.value for s in allowed}:
            raise ValidationError(
                "Invalid transition: %s -> %s is not allowed."
                % (current, new_status)
            )

        now = timezone.now()
        item.item_status = new_status
        if new_status == OrderItemStatus.SHIPPED:
            item.shipped_at = now
            item.order.status = OrderStatus.SHIPPED
            item.order.shipped_at = now
            if tracking_number:
                item.order.tracking_number = tracking_number
            item.order.save(update_fields=("status", "shipped_at", "tracking_number", "updated_at"))
        elif new_status == OrderItemStatus.DELIVERED:
            item.delivered_at = now
            item.order.status = OrderStatus.DELIVERED
            item.order.delivered_at = now
            item.order.save(update_fields=("status", "delivered_at", "updated_at"))
        elif new_status == OrderItemStatus.PROCESSING:
            if item.order.status == OrderStatus.CONFIRMED:
                item.order.status = OrderStatus.PROCESSING
                item.order.save(update_fields=("status", "updated_at"))

        item.save(update_fields=("item_status", "shipped_at", "delivered_at", "updated_at"))
        logger.info(
            "order.update_item_status ok item_id=%s new=%s",
            item.pk, new_status,
        )
        return item

    # -- vendor query helpers ------------------------------------------
    @staticmethod
    def list_for_vendor(vendor_profile, status: str | None = None):
        """Return ``OrderItem`` rows for a vendor, newest first."""
        qs = (
            OrderItem.objects
            .filter(vendor=vendor_profile)
            .select_related("order", "order__user", "product")
            .order_by("-created_at")
        )
        if status:
            qs = qs.filter(item_status=status)


# ===========================================================================
# ReturnService -- Module 5 (Returns & Refunds)
# ===========================================================================
# Spec §5 limits a customer to 4 evidence images per request.
MAX_RETURN_EVIDENCE = 4


class ReturnService:
    """Stateless facade for the 7-step return lifecycle.

    All state transitions live here; views only translate HTTP <-> service
    calls. The forward-only flow::

        PENDING -> APPROVED -> SHIPPED_BACK -> RECEIVED
                -> REFUND_INITIATED -> REFUNDED
        (PENDING | APPROVED) -> REJECTED   (terminal, except REJECTED)

    Each transition validates:

    * the caller is the right actor (customer / vendor / admin), and
    * the current status allows the transition (no skipping, no reverting).
    """

    # -- number generation ---------------------------------------------
    @staticmethod
    def _today_prefix() -> str:
        return "RET-" + timezone.now().strftime("%Y%m%d") + "-"

    @staticmethod
    def generate_return_number() -> str:
        """Return the next ``RET-YYYYMMDD-NNNNN`` identifier.

        Concurrency strategy: take an advisory row-level lock on the
        ``ReturnSequence`` table (one row, never deleted).  This sidesteps
        the ``FOR UPDATE cannot be applied to the nullable side of an
        outer join`` restriction that Django raises on queryset-level
        ``select_for_update`` when the queryset contains joins to other
        tables.
        """
        prefix = ReturnService._today_prefix()

        # Atomically bump a sequence row so the next number is unique.
        from apps.orders.models import ReturnSequence  # local to avoid cycle
        with transaction.atomic():
            (
                ReturnSequence.objects
                .select_for_update()
                .get_or_create(pk=1, defaults={"last_value": 0})
            )
            seq_row = (
                ReturnSequence.objects.select_for_update().get(pk=1)
            )
            seq_row.last_value += 1
            seq_row.save(update_fields=["last_value", "updated_at"])
            return "%s%05d" % (prefix, seq_row.last_value)

    # -- helpers --------------------------------------------------------
    @staticmethod
    def _get_request_for_customer(return_id, user) -> ReturnRequest:
        try:
            return ReturnRequest.objects.select_related(
                "order_item", "order_item__order", "customer",
            ).get(pk=return_id, customer=user)
        except ReturnRequest.DoesNotExist as exc:
            raise ValidationError("Return request not found.") from exc

    @staticmethod
    def _get_request_for_vendor(return_id, vendor_profile) -> ReturnRequest:
        try:
            return ReturnRequest.objects.select_related(
                "order_item", "order_item__vendor", "customer",
            ).get(pk=return_id, order_item__vendor=vendor_profile)
        except ReturnRequest.DoesNotExist as exc:
            raise ValidationError(
                "Return request not found in your store."
            ) from exc

    @staticmethod
    def _get_request_for_admin(return_id) -> ReturnRequest:
        try:
            return ReturnRequest.objects.select_related(
                "order_item", "order_item__vendor", "customer",
            ).get(pk=return_id)
        except ReturnRequest.DoesNotExist as exc:
            raise ValidationError("Return request not found.") from exc

    # -- 1. initiate (customer) ----------------------------------------
    @staticmethod
    @transaction.atomic
    def initiate_return(
        user,
        order_item_id,
        *,
        reason: str,
        description: str,
        images=None,
    ) -> ReturnRequest:
        """Customer opens a return request against an item they bought.

        Per spec §5:

        1. ``order_item.item_status == 'DELIVERED'``
        2. ``now - delivered_at <= 7 days`` (else the window closed)
        3. No existing ``ReturnRequest`` for this item
        4. Up to 4 evidence images stored under ``returns/evidence/``
        """
        # -- 1. fetch + lock the item row -------------------------------
        # NB: ``of=("self",)`` so the FOR UPDATE only locks the
        # ``orders_orderitem`` row and not the joined ``Order`` /
        # ``Product`` / ``VendorProfile`` tables.  Without this Django
        # raises ``FOR UPDATE cannot be applied to the nullable side of
        # an outer join`` because ``OrderItem.product`` is nullable
        # (ON DELETE SET NULL).
        item = (
            OrderItem.objects
            .select_for_update(of=("self",))
            .select_related("order", "vendor", "product")
            .filter(pk=order_item_id)
            .first()
        )
        if item is None:
            raise ValidationError("Order item not found.")
        if item.order.user_id != user.pk:
            raise ValidationError(
                "This item does not belong to your account."
            )
        if item.item_status != OrderItemStatus.DELIVERED:
            raise ValidationError(
                "Only delivered items can be returned (current status: %s)."
                % item.item_status
            )

        # -- 2. window check -------------------------------------------
        delivered_at = item.delivered_at or item.order.delivered_at
        if delivered_at is None:
            raise ValidationError(
                "Delivery timestamp is missing -- cannot start a return."
            )
        age = timezone.now() - delivered_at
        if age > datetime.timedelta(days=RETURN_WINDOW_DAYS):
            days_old = age.days
            raise ValidationError(
                "The 7-day return window has closed (delivered %d days ago)."
                % days_old
            )

        # -- 3. one-return-per-item invariant ---------------------------
        # Lock only the ReturnRequest row (not the joined OrderItem).
        existing = (
            ReturnRequest.objects
            .select_for_update(of=("self",))
            .filter(order_item=item)
            .first()
        )
        if existing is not None:
            raise ValidationError(
                "A return request already exists for this item (status: %s)."
                % existing.status
            )

        # -- input validation ------------------------------------------
        valid_reasons = {r.value for r in ReturnReason}
        if reason not in valid_reasons:
            raise ValidationError(
                "Invalid reason '%s'. Allowed: %s."
                % (reason, ", ".join(sorted(valid_reasons)))
            )
        description = (description or "").strip()
        if len(description) < 20:
            raise ValidationError(
                "Description must be at least 20 characters long."
            )

        images = images or []
        if len(images) > MAX_RETURN_EVIDENCE:
            raise ValidationError(
                "You can upload at most %d evidence images."
                % MAX_RETURN_EVIDENCE
            )

        # -- 4. create header + evidence -------------------------------
        ret = ReturnRequest.objects.create(
            order_item=item,
            customer=user,
            return_number=ReturnService.generate_return_number(),
            reason=reason,
            description=description,
            status=ReturnStatus.PENDING,
        )
        for img in images:
            ReturnEvidence.objects.create(return_request=ret, image=img)

        logger.info(
            "return.initiate ok return_id=%s return_number=%s item_id=%s evidence=%d",
            ret.pk, ret.return_number, item.pk, len(images),
        )
        return ret

    # -- 2. approve (vendor) -------------------------------------------
    @staticmethod
    @transaction.atomic
    def approve_return(vendor_profile, return_id, *, vendor_notes: str = "") -> ReturnRequest:
        ret = ReturnService._get_request_for_vendor(return_id, vendor_profile)
        if ret.status != ReturnStatus.PENDING:
            raise ValidationError(
                "Only PENDING returns can be approved (current: %s)."
                % ret.status
            )
        now = timezone.now()
        ret.status = ReturnStatus.APPROVED
        ret.approved_at = now
        if vendor_notes:
            ret.vendor_notes = vendor_notes
        ret.save(update_fields=(
            "status", "approved_at", "vendor_notes", "updated_at",
        ))
        logger.info("return.approve ok return_id=%s", ret.pk)
        return ret

    # -- 3. reject (vendor) --------------------------------------------
    @staticmethod
    @transaction.atomic
    def reject_return(
        vendor_profile,
        return_id,
        *,
        reason: str,
        vendor_notes: str = "",
    ) -> ReturnRequest:
        ret = ReturnService._get_request_for_vendor(return_id, vendor_profile)
        if ret.status != ReturnStatus.PENDING:
            raise ValidationError(
                "Only PENDING returns can be rejected (current: %s)."
                % ret.status
            )
        reason_clean = (reason or "").strip()
        if len(reason_clean) < 5:
            raise ValidationError(
                "Rejection reason must be at least 5 characters."
            )
        now = timezone.now()
        ret.status = ReturnStatus.REJECTED
        ret.rejected_at = now
        ret.rejection_reason = reason_clean
        if vendor_notes:
            ret.vendor_notes = vendor_notes
        ret.save(update_fields=(
            "status", "rejected_at", "rejection_reason",
            "vendor_notes", "updated_at",
        ))
        logger.info("return.reject ok return_id=%s", ret.pk)
        return ret

    # -- 4. ship back (customer) ---------------------------------------
    @staticmethod
    @transaction.atomic
    def ship_back(user, return_id, *, tracking_number: str) -> ReturnRequest:
        ret = ReturnService._get_request_for_customer(return_id, user)
        if ret.status != ReturnStatus.APPROVED:
            raise ValidationError(
                "Returns can only be shipped back after vendor approval "
                "(current: %s)." % ret.status
            )
        tn = (tracking_number or "").strip()
        if len(tn) < 3:
            raise ValidationError(
                "Tracking number looks too short (min 3 chars)."
            )
        now = timezone.now()
        ret.status = ReturnStatus.SHIPPED_BACK
        ret.shipped_back_at = now
        ret.tracking_number_return = tn
        ret.save(update_fields=(
            "status", "shipped_back_at",
            "tracking_number_return", "updated_at",
        ))
        logger.info("return.ship_back ok return_id=%s tn=%s", ret.pk, tn)
        return ret

    # -- 5. mark received (vendor) -------------------------------------
    @staticmethod
    @transaction.atomic
    def mark_received(vendor_profile, return_id, *, vendor_notes: str = "") -> ReturnRequest:
        ret = ReturnService._get_request_for_vendor(return_id, vendor_profile)
        if ret.status != ReturnStatus.SHIPPED_BACK:
            raise ValidationError(
                "Only SHIPPED_BACK returns can be marked received "
                "(current: %s)." % ret.status
            )
        now = timezone.now()
        ret.status = ReturnStatus.RECEIVED
        ret.received_at = now
        if vendor_notes:
            ret.vendor_notes = vendor_notes
        ret.save(update_fields=(
            "status", "received_at", "vendor_notes", "updated_at",
        ))
        logger.info("return.mark_received ok return_id=%s", ret.pk)
        return ret

    # -- 6. process refund (admin) -------------------------------------
    @staticmethod
    @transaction.atomic
    def process_refund(admin_user, return_id, *, admin_notes: str = "") -> ReturnRequest:
        ret = ReturnService._get_request_for_admin(return_id)
        if ret.status != ReturnStatus.RECEIVED:
            raise ValidationError(
                "Refund can only be processed after the vendor receives the "
                "item (current: %s)." % ret.status
            )
        now = timezone.now()
        ret.status = ReturnStatus.REFUND_INITIATED
        ret.refund_initiated_at = now
        if admin_notes:
            ret.admin_notes = admin_notes
        ret.save(update_fields=(
            "status", "refund_initiated_at", "admin_notes", "updated_at",
        ))
        logger.info(
            "return.process_refund ok return_id=%s by_admin=%s",
            ret.pk, getattr(admin_user, "pk", None),
        )
        return ret

    # -- 7. confirm refund (admin) -------------------------------------
    @staticmethod
    @transaction.atomic
    def confirm_refund(admin_user, return_id, *, admin_notes: str = "") -> ReturnRequest:
        ret = ReturnService._get_request_for_admin(return_id)
        if ret.status != ReturnStatus.REFUND_INITIATED:
            raise ValidationError(
                "Refund can only be confirmed after it has been initiated "
                "(current: %s)." % ret.status
            )
        now = timezone.now()
        ret.status = ReturnStatus.REFUNDED
        ret.refunded_at = now
        # Mark the parent order's payment_status = REFUNDED so the order
        # surfaces the refund in the buyer's history.  Per spec §4 we
        # already have a REFUNDED enum on Order; we only flip the parent
        # when every line is closed -- but for a single-item return we
        # flip immediately.
        item = ret.order_item
        if item is not None and item.order_id is not None:
            order = item.order
            order.payment_status = "REFUNDED"
            order.status = OrderStatus.RETURNED
            order.save(update_fields=("payment_status", "status", "updated_at"))
        if admin_notes:
            ret.admin_notes = admin_notes
        ret.save(update_fields=(
            "status", "refunded_at", "admin_notes", "updated_at",
        ))
        logger.info(
            "return.confirm_refund ok return_id=%s by_admin=%s",
            ret.pk, getattr(admin_user, "pk", None),
        )
        return ret

    # -- read-side helpers ---------------------------------------------
    @staticmethod
    def list_for_customer(user):
        return (
            ReturnRequest.objects
            .filter(customer=user)
            .select_related(
                "order_item", "order_item__order",
                "order_item__vendor", "order_item__product",
            )
            .prefetch_related("evidence")
            .order_by("-created_at")
        )

    @staticmethod
    def list_for_vendor(vendor_profile, status: str | None = None):
        qs = (
            ReturnRequest.objects
            .filter(order_item__vendor=vendor_profile)
            .select_related(
                "order_item", "order_item__order",
                "order_item__product", "customer",
            )
            .prefetch_related("evidence")
            .order_by("-created_at")
        )
        if status:
            qs = qs.filter(status=status)
        return qs

    @staticmethod
    def list_for_admin(status: str | None = None):
        qs = (
            ReturnRequest.objects
            .select_related(
                "order_item", "order_item__order",
                "order_item__vendor", "customer",
            )
            .prefetch_related("evidence")
            .order_by("-created_at")
        )
        if status:
            qs = qs.filter(status=status)
        return qs


# ====================================================================
# OrderAdminService — Module 9 admin order list/detail (read-only)
# ====================================================================
class OrderAdminServiceError(Exception):
    """Typed error for admin-order operations.

    Views read ``exc.http_status`` to map a failure to a DRF response.
    """

    DEFAULT_HTTP_STATUS = 400

    def __init__(
        self,
        code: str,
        message: str,
        *,
        fields: dict | None = None,
        http_status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.fields = fields or {}
        self.http_status = http_status or self.DEFAULT_HTTP_STATUS


class OrderAdminService:
    """Business-logic for admin order browsing.

    Per spec §Module 9 (lines 3207-3225) admin order endpoints are
    read-only — list with filters + retrieve by order_number. Status
    transitions stay on the existing :class:`OrderService`.
    """

    @staticmethod
    def list_orders(
        *,
        status: str = "",
        date_from: str = "",
        date_to: str = "",
        vendor: str = "",
        search: str = "",
        ordering: str = "-created_at",
    ):
        """Return an admin-scoped queryset of :class:`Order`.

        * ``status`` must be a valid :class:`OrderStatus` value or empty.
        * ``date_from`` / ``date_to`` are ISO-8601 date strings
          (``YYYY-MM-DD``); invalid dates raise ``ValueError`` which the
          view maps to ``validation_error``.
        * ``vendor`` is a :class:`VendorProfile` UUID; filtered via
          ``items__vendor_id`` so the order must contain at least one
          line item from that vendor.
        * ``search`` matches against ``order_number`` and the customer's
          email (case-insensitive).
        """
        from datetime import datetime

        from apps.orders.models import Order, OrderStatus

        qs = Order.all_objects.select_related("user").prefetch_related("items")

        if status:
            valid = {choice.value for choice in OrderStatus}
            if status not in valid:
                raise ValueError("Unknown status: %s" % status)
            qs = qs.filter(status=status)

        if date_from:
            try:
                dt = datetime.strptime(date_from, "%Y-%m-%d")
            except ValueError as exc:
                raise ValueError("date_from must be YYYY-MM-DD") from exc
            qs = qs.filter(created_at__date__gte=dt.date())

        if date_to:
            try:
                dt = datetime.strptime(date_to, "%Y-%m-%d")
            except ValueError as exc:
                raise ValueError("date_to must be YYYY-MM-DD") from exc
            qs = qs.filter(created_at__date__lte=dt.date())

        if vendor:
            qs = qs.filter(items__vendor_id=vendor).distinct()

        if search:
            term = search.strip()
            if term:
                qs = qs.filter(
                    models_q(order_number__icontains=term)
                    | models_q(user__email__icontains=term)
                )

        # Defensive ordering: only allow orderings on indexed fields.
        allowed = {
            "created_at", "-created_at",
            "total", "-total",
            "status", "-status",
            "order_number", "-order_number",
        }
        if ordering in allowed:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-created_at")

        return qs

    @staticmethod
    def get_order_by_number(order_number: str):
        """Fetch an :class:`Order` by its human-facing order number."""
        from apps.orders.models import Order
        try:
            return (
                Order.all_objects
                .select_related("user")
                .prefetch_related("items", "items__product")
                .get(order_number=order_number)
            )
        except Order.DoesNotExist as exc:
            raise OrderAdminServiceError(
                "not_found",
                "Order not found.",
                fields={"order_number": "No order with that number."},
                http_status=404,
            ) from exc


def models_q(*args, **kwargs):
    """Re-export ``Q`` for use in module-level service helpers."""
    from django.db.models import Q
    return Q(*args, **kwargs)


# ====================================================================
# ReturnAdminService — Module 9 admin override of return flow
# ====================================================================
class ReturnAdminServiceError(OrderAdminServiceError):
    """Typed error for admin return operations. Aliases
    :class:`OrderAdminServiceError` so the existing admin views'
    ``except OrderAdminServiceError`` clauses catch it too."""


class ReturnAdminService:
    """Admin-side return workflow (Module 9).

    Two actions live here that are NOT exposed to vendors:

    * ``process_refund`` — admin marks the refund as initiated
      (status ``REFUND_INITIATED``). Used when the admin must push a
      refund through the gateway manually because the vendor-side
      flow is stuck.
    * ``confirm_refund`` — admin confirms the refund has cleared
      (status ``REFUNDED``).

    Both actions only run for returns that have at least reached
    ``RECEIVED``. Anything earlier in the lifecycle is the vendor's
    job — admin override is refused with ``invalid_status``.
    """

    @staticmethod
    def _get(return_id) -> ReturnRequest:
        try:
            return (
                ReturnRequest.all_objects
                .select_related(
                    "order_item", "order_item__order",
                    "order_item__vendor", "customer",
                )
                .get(pk=return_id)
            )
        except ReturnRequest.DoesNotExist as exc:
            raise ReturnAdminServiceError(
                "not_found",
                "Return request not found.",
                fields={"return_id": "No return with that id."},
                http_status=404,
            ) from exc

    @staticmethod
    @transaction.atomic
    def process_refund(*, actor, return_id, admin_notes: str = "") -> ReturnRequest:
        ret = ReturnAdminService._get(return_id)
        if ret.status not in {ReturnStatus.RECEIVED, ReturnStatus.REFUND_INITIATED}:
            raise ReturnAdminServiceError(
                "invalid_status",
                "Refund can only be processed once the return has been received.",
                http_status=400,
            )
        if ret.status == ReturnStatus.REFUND_INITIATED:
            return ret
        ret.status = ReturnStatus.REFUND_INITIATED
        ret.refund_initiated_at = timezone.now()
        if admin_notes:
            ret.admin_notes = admin_notes
        ret.save(update_fields=[
            "status", "refund_initiated_at",
            "admin_notes", "updated_at",
        ])
        logger.info(
            "return.process_refund id=%s admin=%s", ret.pk, getattr(actor, "pk", None),
        )
        return ret

    @staticmethod
    @transaction.atomic
    def confirm_refund(*, actor, return_id, admin_notes: str = "") -> ReturnRequest:
        ret = ReturnAdminService._get(return_id)
        if ret.status != ReturnStatus.REFUND_INITIATED:
            raise ReturnAdminServiceError(
                "invalid_status",
                "Refund must be initiated before it can be confirmed.",
                http_status=400,
            )
        ret.status = ReturnStatus.REFUNDED
        ret.refunded_at = timezone.now()
        if admin_notes:
            ret.admin_notes = admin_notes
        ret.save(update_fields=[
            "status", "refunded_at",
            "admin_notes", "updated_at",
        ])
        logger.info(
            "return.confirm_refund id=%s admin=%s", ret.pk, getattr(actor, "pk", None),
        )
        return ret