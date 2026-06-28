"""URLconf for the wishlist app -- Module 3.

Mounted at ``/api/v1/wishlist/`` by ``config/urls.py``.
"""
from __future__ import annotations

from django.urls import path

from apps.wishlist.views import (
    WishlistClearView,
    WishlistDetailView,
    WishlistItemDetailView,
    WishlistItemListCreateView,
    WishlistItemMoveToCartView,
)

app_name = "wishlist"

urlpatterns: list = [
    path("", WishlistDetailView.as_view(), name="wishlist-detail"),
    path("clear/", WishlistClearView.as_view(), name="wishlist-clear"),
    path("items/", WishlistItemListCreateView.as_view(), name="wishlist-item-list"),
    path(
        "items/<uuid:item_id>/",
        WishlistItemDetailView.as_view(),
        name="wishlist-item-detail",
    ),
    path(
        "items/<uuid:item_id>/move-to-cart/",
        WishlistItemMoveToCartView.as_view(),
        name="wishlist-item-move-to-cart",
    ),
]  # noqa: E501