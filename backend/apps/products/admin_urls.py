"""Admin product moderation URLs.

Mounted at ``/api/v1/admin/products/`` (see ``config/urls.py``)."""
from __future__ import annotations

from django.urls import path

from apps.products.views import (
    AdminProductDetailOrDeleteView,
    AdminProductHardDeleteView,
    AdminProductHideView,
    AdminProductListView,
    AdminProductModerateView,
    AdminProductRestoreView,
)

app_name = "admin_products"

urlpatterns = [
    path("", AdminProductListView.as_view(), name="list"),
    path("<uuid:product_id>/moderate/", AdminProductModerateView.as_view(), name="moderate"),
    path("<uuid:product_id>/", AdminProductDetailOrDeleteView.as_view(), name="detail"),
    # Slug-keyed moderation surface (spec §3166-3172). Kept alongside the
    # UUID routes so existing admin UIs that address products by UUID
    # keep working; the React console talks to these new endpoints.
    path("<slug:slug>/hide/", AdminProductHideView.as_view(), name="hide"),
    path("<slug:slug>/restore/", AdminProductRestoreView.as_view(), name="restore"),
    path("<slug:slug>/", AdminProductHardDeleteView.as_view(), name="hard-delete"),
]