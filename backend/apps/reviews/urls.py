"""URL wiring for the reviews app -- Module 6.

Exposed as three independent url-list groups so they can be mounted
at three different prefixes from ``config/urls.py``:

* ``product_router``  -- ``/api/v1/products/<slug>/...`` (list, create,
  can-review, rating-breakdown).
* ``review_router``   -- ``/api/v1/reviews/<id>/...`` (retrieve,
  update, destroy, helpful).
* ``vendor_router``   -- ``/api/v1/vendor/reviews/...`` (vendor list,
  vendor reply add/remove).
* ``admin_router``    -- ``/api/v1/admin/reviews/...`` (admin list,
  retrieve, hide, restore, remove reply).

Keeping each group as a flat list (not a ``DefaultRouter``) makes the
naming + lookup predictable -- the spec fixes all of the path tokens.
"""
from __future__ import annotations

from django.urls import path

from apps.reviews.views import (
    AdminReviewViewSet,
    ProductReviewViewSet,
    ReviewViewSet,
    VendorReviewViewSet,
)


# ---------------------------------------------------------------------
# Product-scoped (mounted under /api/v1/products/<slug>/...)
# ---------------------------------------------------------------------
product_router = [
    path(
        "<slug:slug>/reviews/",
        ProductReviewViewSet.as_view({"get": "list", "post": "create"}),
        name="product-reviews-list",
    ),
    path(
        "<slug:slug>/can-review/",
        ProductReviewViewSet.as_view({"get": "can_review"}),
        name="product-can-review",
    ),
    path(
        "<slug:slug>/rating-breakdown/",
        ProductReviewViewSet.as_view({"get": "rating_breakdown"}),
        name="product-rating-breakdown",
    ),
]


# ---------------------------------------------------------------------
# /api/v1/reviews/<id>/...  (author CRUD + helpful)
# ---------------------------------------------------------------------
review_router = [
    # Spec: ``GET /api/v1/reviews/can-review/?product=<slug>`` -- lives
    # at the router root (no id) so it sits at ``/reviews/can-review/``.
    path(
        "can-review/",
        ReviewViewSet.as_view({"get": "can_review"}),
        name="review-can-review",
    ),
    path(
        "<uuid:pk>/",
        ReviewViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="review-detail",
    ),
    path(
        "<uuid:pk>/helpful/",
        ReviewViewSet.as_view({"post": "helpful"}),
        name="review-helpful",
    ),
]


# ---------------------------------------------------------------------
# /api/v1/vendor/reviews/...  (vendor list + reply)
# ---------------------------------------------------------------------
vendor_router = [
    path(
        "",
        VendorReviewViewSet.as_view({"get": "list"}),
        name="vendor-reviews-list",
    ),
    path(
        "<uuid:pk>/reply/",
        VendorReviewViewSet.as_view({
            "post": "reply",
            "delete": "remove_reply",
        }),
        name="vendor-review-reply",
    ),
]


# ---------------------------------------------------------------------
# /api/v1/admin/reviews/...  (admin moderation)
# ---------------------------------------------------------------------
admin_router = [
    path(
        "",
        AdminReviewViewSet.as_view({"get": "list"}),
        name="admin-reviews-list",
    ),
    path(
        "<uuid:pk>/",
        AdminReviewViewSet.as_view({"get": "retrieve"}),
        name="admin-reviews-detail",
    ),
    # Spec: ``PATCH /api/v1/admin/reviews/{id}/moderate/`` --
    # single endpoint, body ``{is_hidden: true|false}``.
    path(
        "<uuid:pk>/moderate/",
        AdminReviewViewSet.as_view({"patch": "moderate"}),
        name="admin-reviews-moderate",
    ),
    path(
        "<uuid:pk>/hide/",
        AdminReviewViewSet.as_view({"patch": "hide"}),
        name="admin-reviews-hide",
    ),
    path(
        "<uuid:pk>/restore/",
        AdminReviewViewSet.as_view({"patch": "restore"}),
        name="admin-reviews-restore",
    ),
    path(
        "<uuid:pk>/reply/",
        AdminReviewViewSet.as_view({"delete": "remove_vendor_reply"}),
        name="admin-reviews-remove-reply",
    ),
]


# Default aggregated urlpatterns -- the legacy import in
# ``config/urls.py`` uses this for the ``reviews/`` namespace.
urlpatterns = review_router

# When mounted under ``/api/v1/vendor/reviews/`` or
# ``/api/v1/admin/reviews/`` (see config/urls.py) we want the spec's
# paths to resolve relative to that prefix. The router lists above are
# already written without a leading slash (e.g. ``""`` or
# ``<uuid:pk>/moderate/``), so we can re-export them under dedicated
# names for ``include(...)``.
vendor_urlpatterns = vendor_router
admin_urlpatterns = admin_router