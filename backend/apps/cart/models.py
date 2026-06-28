"""Cart models -- Module 3 (spec sec. "MODULE 3 -- Cart & Wishlist").

Two concrete models:

* ``Cart``       -- one-to-one with ``CustomUser``; created lazily on first
                    read so anonymous browsing never persists anything.
* ``CartItem``   -- one row per product in the cart. ``quantity`` is the
                    customer's intended count; ``is_unavailable`` is set
                    by ``CartService.sync_cart_with_stock`` whenever the
                    product's current stock is below the requested
                    quantity (or zero).

A unique constraint on ``(cart, product)`` enforces "at most one row per
product per cart".  Quantity bumps therefore update the existing row
instead of inserting a duplicate.
"""
from __future__ import annotations

import uuid

from django.core.validators import MinValueValidator
from django.db import models

from apps.accounts.models import CustomUser
from apps.common.models import TimeStampedModel
from apps.products.models import Product


class Cart(TimeStampedModel):
    """One-to-one server-persisted cart per customer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="cart",
    )

    class Meta:
        verbose_name = "Cart"
        verbose_name_plural = "Carts"

    def __str__(self) -> str:  # pragma: no cover
        return "Cart<%s>" % self.user_id

    # -- helpers ---------------------------------------------------------
    @property
    def item_count(self) -> int:
        """Total quantity across all line items (ignores ``is_unavailable``)."""
        return sum(item.quantity for item in self.items.all())

    @property
    def subtotal(self):
        """Sum of (quantity * effective_price) across all *available* items."""
        from decimal import Decimal

        total = Decimal("0.00")
        for item in self.items.select_related("product").all():
            if item.is_unavailable:
                continue
            total += item.quantity * item.product.effective_price
        return total


class CartItem(TimeStampedModel):
    """A single line in a cart -- one row per (cart, product) pair."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cart = models.ForeignKey(
        Cart,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="cart_items",
    )
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        default=1,
    )
    # Set true by CartService.sync_cart_with_stock when current stock is
    # below the requested quantity or zero.  Never user-editable.
    is_unavailable = models.BooleanField(default=False, db_index=True)

    class Meta:
        verbose_name = "Cart item"
        verbose_name_plural = "Cart items"
        ordering = ("-updated_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("cart", "product"),
                name="uniq_cartitem_per_product",
            ),
        ]
        indexes = [
            models.Index(fields=("cart", "is_unavailable")),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return "CartItem<%s x %s>" % (self.product_id, self.quantity)

    # -- computed display helpers ---------------------------------------
    @property
    def item_total(self):
        """quantity * effective_price -- used by ``CartItemSerializer``."""
        from decimal import Decimal

        return self.quantity * self.product.effective_price
