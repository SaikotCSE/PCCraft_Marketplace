"""URLconf for the cart app -- Module 3.

Routes (mounted at ``/api/v1/cart/`` by ``config/urls.py``)::

    GET    /                -> CartDetailView
    DELETE /clear/          -> CartClearView
    POST   /items/          -> CartItemListCreateView
    PATCH  /items/<id>/     -> CartItemDetailView
    DELETE /items/<id>/     -> CartItemDetailView
"""
from __future__ import annotations

from django.urls import path

from apps.cart.views import (
    CartClearView,
    CartDetailView,
    CartItemDetailView,
    CartItemListCreateView,
)

app_name = "cart"

urlpatterns: list = [
    path("", CartDetailView.as_view(), name="cart-detail"),
    path("clear/", CartClearView.as_view(), name="cart-clear"),
    path("items/", CartItemListCreateView.as_view(), name="cart-item-list"),
    path("items/<uuid:item_id>/", CartItemDetailView.as_view(), name="cart-item-detail"),
]