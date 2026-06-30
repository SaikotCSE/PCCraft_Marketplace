"""Wishlist business logic -- Module 3.

All wishlist rules live here.  Views are thin wrappers around these
methods.

Public surface::

    WishlistService.get_or_create_wishlist(user)
    WishlistService.add_item(wishlist, product_id)
    WishlistService.remove_item(wishlist_item)
    WishlistService.clear_wishlist(wishlist)
    WishlistService.move_to_cart(wishlist_item, quantity=1)
        -- delegates to ``CartService.add_item`` then deletes the row
"""
from __future__ import annotations

from django.db import transaction

from apps.products.models import Product
from apps.wishlist.models import Wishlist, WishlistItem


class WishlistService:
    """Static service facade -- instantiated nowhere."""

    # ------------------------------------------------------------------
    # lookup helpers
    # ------------------------------------------------------------------
    @staticmethod
    @transaction.atomic
    def get_or_create_wishlist(user) -> Wishlist:
        """Return the singleton wishlist for ``user``, creating it on demand.

        Uses ``select_for_update`` so concurrent first-touch requests
        can't create duplicate wishlists for the same user.

        Args:
            user: The user whose wishlist is fetched or created.

        Returns:
            The :class:`Wishlist` for ``user``.
        """
        wishlist, _created = Wishlist.objects.select_for_update().get_or_create(user=user)
        return wishlist

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------
    @staticmethod
    @transaction.atomic
    def add_item(wishlist: Wishlist, product_id) -> WishlistItem:
        """Idempotently attach a product to the wishlist.

        Raises ``Product.DoesNotExist`` if the product is missing.
        """
        product = Product.objects.get(pk=product_id)
        item, _created = WishlistItem.objects.get_or_create(
            wishlist=wishlist,
            product=product,
        )
        return item

    @staticmethod
    def remove_item(wishlist_item: WishlistItem) -> None:
        """Delete a single wishlist line item.

        Args:
            wishlist_item: The :class:`WishlistItem` to remove.
                Persisted state of the row is destroyed; the model
                instance itself is not reused.
        """
        wishlist_item.delete()

    @staticmethod
    def clear_wishlist(wishlist: Wishlist) -> int:
        """Delete every row; returns the count removed."""
        deleted, _ = WishlistItem.objects.filter(wishlist=wishlist).delete()
        return deleted

    # ------------------------------------------------------------------
    # cross-app hook
    # ------------------------------------------------------------------
    @staticmethod
    @transaction.atomic
    def move_to_cart(wishlist_item: WishlistItem, quantity: int = 1):
        """Move one wishlist line into the user's cart.

        Steps (single DB transaction):

        1. Resolve the user's cart (create if needed).
        2. Delegate to ``CartService.add_item`` -- this enforces stock.
        3. On success, remove the wishlist row.

        Returns the freshly-upserted ``CartItem``.  Any exception from
        ``CartService.add_item`` propagates so the caller can return a
        meaningful HTTP error and the wishlist row stays put.
        """
        # Local import avoids a circular module-level dependency.
        from apps.cart.services import CartService

        user = wishlist_item.wishlist.user
        cart = CartService.get_or_create_cart(user)
        cart_item = CartService.add_item(
            cart=cart,
            product_id=wishlist_item.product_id,
            quantity=quantity,
        )
        wishlist_item.delete()
        return cart_item