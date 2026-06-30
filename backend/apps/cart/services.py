"""Cart service layer -- Module 3.

All cart-mutating business rules live here so views stay thin.

Behaviour highlights (per spec sec. "MODULE 3 -- Cart & Wishlist"):

* ``add_item``     increments an existing line; raises ``ValidationError``
                    when the requested quantity exceeds available stock.
* ``update_item``  zero quantity removes the row.
* ``sync_cart_with_stock`` marks items unavailable when current stock
                    is below the requested quantity (or zero).
* ``mark_unavailable_items`` is the "after stock change" hook used by
                    other modules (e.g. when an order is placed).
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Iterable

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.cart.models import Cart, CartItem
from apps.products.models import Product

logger = logging.getLogger(__name__)


class CartService:
    """Stateless facade for cart mutations.

    Methods are deliberately written as ``@staticmethod``s so callers can
    invoke them without instantiating the class.
    """

    # -- fetch / create --------------------------------------------------
    @staticmethod
    def get_or_create_cart(user) -> Cart:
        """Return the user's cart, creating it on first use."""
        cart, _ = Cart.objects.get_or_create(user=user)
        return cart

    # -- mutations -------------------------------------------------------
    @staticmethod
    @transaction.atomic
    def add_item(cart: Cart, product_id, quantity: int = 1) -> CartItem:
        """Add (or increment) a product line in the cart.

        Raises ``ValidationError`` when the requested quantity exceeds
        available stock; in that case nothing is persisted.
        """
        if quantity is None or int(quantity) < 1:
            raise ValidationError("Quantity must be at least 1.")

        # SELECT FOR UPDATE on the product row guards against stock
        # racing between concurrent cart writes / order placements.
        try:
            product = Product.objects.select_for_update().get(pk=product_id, is_active=True)
        except Product.DoesNotExist as exc:
            raise ValidationError("Product not found.") from exc

        if product.status != "ACTIVE":
            raise ValidationError("Product is not available for purchase.")

        quantity = int(quantity)
        existing = (
            CartItem.objects.select_for_update()
            .filter(cart=cart, product=product)
            .first()
        )

        new_quantity = (existing.quantity if existing else 0) + quantity
        if new_quantity > product.stock_quantity:
            raise ValidationError(
                "Requested quantity (%d) exceeds available stock (%d)."
                % (new_quantity, product.stock_quantity)
            )

        if existing is None:
            existing = CartItem(cart=cart, product=product, quantity=quantity)
        else:
            existing.quantity = new_quantity
            # If the product was previously flagged unavailable but now
            # has enough stock for the requested quantity, clear the flag.
            existing.is_unavailable = False
        existing.save()
        logger.info(
            "cart.add_item ok cart_id=%s product_id=%s qty=%s",
            cart.pk, product.pk, existing.quantity,
        )
        return existing

    @staticmethod
    @transaction.atomic
    def update_item(cart_item: CartItem, quantity: int) -> CartItem | None:
        """Set ``cart_item.quantity`` to ``quantity``.

        Returns ``None`` if the row was removed (because quantity=0).
        Raises ``ValidationError`` if quantity > current stock.
        """
        quantity = int(quantity)

        if quantity <= 0:
            cart_item.delete()
            return None

        product = Product.objects.select_for_update().get(pk=cart_item.product_id)
        if quantity > product.stock_quantity:
            raise ValidationError(
                "Requested quantity (%d) exceeds available stock (%d)."
                % (quantity, product.stock_quantity)
            )

        cart_item.quantity = quantity
        cart_item.is_unavailable = False
        cart_item.save(update_fields=("quantity", "is_unavailable", "updated_at"))
        return cart_item

    @staticmethod
    def remove_item(cart_item: CartItem) -> None:
        """Delete a single cart line item.

        The persisted row is removed via the model ``delete()`` so
        any cascading FKs (none today, but reserved for future
        gift-wrap / add-on tables) fire as well.

        Args:
            cart_item: The :class:`CartItem` to remove from the cart.
        """
        cart_item.delete()

    @staticmethod
    @transaction.atomic
    def clear_cart(cart: Cart) -> int:
        """Delete every line in the cart; returns the number removed."""
        deleted, _ = cart.items.all().delete()
        logger.info("cart.clear_cart ok cart_id=%s removed=%s", cart.pk, deleted)
        return deleted

    # -- stock syncing ---------------------------------------------------
    @staticmethod
    def mark_unavailable_items(cart: Cart) -> int:
        """Flag any line whose product is now out of stock.

        Called from order placement / vendor stock update hooks.  Returns
        the number of rows flagged (excluding rows already flagged).
        """
        items = cart.items.select_related("product").all()
        flagged = 0
        for item in items:
            should_flag = (
                item.product.stock_quantity <= 0
                or item.quantity > item.product.stock_quantity
            )
            if should_flag and not item.is_unavailable:
                item.is_unavailable = True
                item.save(update_fields=("is_unavailable", "updated_at"))
                flagged += 1
        return flagged

    @staticmethod
    def sync_cart_with_stock(cart: Cart) -> int:
        """Walk every line and flip ``is_unavailable`` based on current stock.

        Called on every GET /cart/ so the UI always reflects reality.
        Returns the number of rows whose flag changed.
        """
        items = cart.items.select_related("product").all()
        changed = 0
        for item in items:
            should_flag = (
                not item.product.is_active
                or item.product.status != "ACTIVE"
                or item.product.stock_quantity <= 0
                or item.quantity > item.product.stock_quantity
            )
            if should_flag != item.is_unavailable:
                item.is_unavailable = should_flag
                item.save(update_fields=("is_unavailable", "updated_at"))
                changed += 1
        return changed

    # -- summary ---------------------------------------------------------
    @staticmethod
    def get_cart_summary(cart: Cart) -> dict:
        """Compute the full summary the frontend needs to render the cart.

        Shape::

            {
                "items":      [<serialized CartItem>...],
                "subtotal":   "1234.50",
                "item_count": 3,
            }

        ``item_count`` counts every unit (so the navbar badge is correct
        even when two items each have quantity=2).
        """
        items_qs = cart.items.select_related(
            "product", "product__brand", "product__category", "product__vendor"
        ).order_by("-updated_at")

        # Side-effect: refresh is_unavailable flags before serialising.
        CartService.sync_cart_with_stock(cart)
        items_qs = cart.items.select_related(
            "product", "product__brand", "product__category", "product__vendor"
        ).order_by("-updated_at")

        subtotal = Decimal("0.00")
        item_count = 0
        for item in items_qs:
            item_count += item.quantity
            if not item.is_unavailable:
                subtotal += item.quantity * item.product.effective_price

        # Lazy import avoids a circular dep at module load time.
        from apps.cart.serializers import CartItemSerializer

        return {
            "items": CartItemSerializer(
                list(items_qs), many=True, context={"request": None},
            ).data,
            "subtotal": str(subtotal),
            "item_count": item_count,
        }

    # -- bulk helpers ----------------------------------------------------
    @staticmethod
    def flag_products(cart: Cart, products: Iterable[Product]) -> int:
        """Mark any line referencing one of ``products`` as unavailable.

        Useful when the orders app places an order and decrements stock;
        other customers' carts may need re-flagging.  Returns the number
        of lines updated.
        """
        product_ids = {p.pk for p in products}
        flagged = 0
        for item in cart.items.filter(product_id__in=product_ids):
            if not item.is_unavailable:
                item.is_unavailable = True
                item.save(update_fields=("is_unavailable", "updated_at"))
                flagged += 1
        return flagged