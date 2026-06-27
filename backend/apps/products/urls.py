"""URLconf for the products app.

The router mounts:

* ``/api/v1/products/``               → public catalog (list / retrieve / trending / search).

The vendor CRUD router (``vendor_router``) is exposed at the project level
under ``/api/v1/vendor/products/`` from :mod:`config.urls`, per spec §2.7.
Keeping it out of this module prevents the vendor prefix from being
shadowed when the products app is mounted at ``products/``.

Note that ``trending`` and ``search`` are declared explicitly so the
URL pattern order is deterministic.
"""
from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.products.views import PublicProductListView, VendorProductViewSet

app_name = "products"

# Public read-only routes.
public_router = DefaultRouter()
public_router.register("", PublicProductListView, basename="product")

# Vendor routes — exposed at the project level (see config/urls.py).
# Registered with a ``products/`` prefix so the full URL is
# ``/api/v1/vendor/products/...`` per spec §2.7.
vendor_router = DefaultRouter()
vendor_router.register("products", VendorProductViewSet, basename="vendor-product")

urlpatterns: list = [
    # Public catalog must come LAST so its dynamic ``<slug>`` lookup
    # doesn't shadow other patterns at the same prefix.
    path("", include((public_router.urls, "public"), namespace="public")),
]