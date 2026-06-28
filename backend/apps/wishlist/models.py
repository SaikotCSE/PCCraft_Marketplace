"""Wishlist models -- Module 3 (spec sec. "MODULE 3 -- Cart & Wishlist").

* ``Wishlist``      -- one-to-one with ``CustomUser``; created lazily.
* ``WishlistItem``  -- one row per product the user has saved for later.
                       Unique on ``(wishlist, product)`` -- "save again"
                       is idempotent.  ``move_to_cart`` is implemented as
                       a service-layer operation, not a model field.
"""
from __future__ import annotations

import uuid

from django.db import models

from apps.accounts.models import CustomUser
from apps.common.models import TimeStampedModel
from apps.products.models import Product


class Wishlist(TimeStampedModel):
    """One-to-one server-persisted wishlist per customer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="wishlist",
    )

    class Meta:
        verbose_name = "Wishlist"
        verbose_name_plural = "Wishlists"

    def __str__(self) -> str:  # pragma: no cover
        return "Wishlist<%s>" % self.user_id

    @property
    def item_count(self) -> int:
        return self.items.count()


class WishlistItem(TimeStampedModel):
    """A single saved-for-later row -- one per (wishlist, product) pair."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wishlist = models.ForeignKey(
        Wishlist,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="wishlist_items",
    )

    class Meta:
        verbose_name = "Wishlist item"
        verbose_name_plural = "Wishlist items"
        ordering = ("-updated_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("wishlist", "product"),
                name="uniq_wishlistitem_per_product",
            ),
        ]
        indexes = [
            models.Index(fields=("wishlist",)),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return "WishlistItem<%s>" % self.product_id
