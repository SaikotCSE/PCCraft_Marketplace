"""HTTP API for the recommendations app (Module 7 spec §7.3).

Five GET endpoints + one POST action (on the products router)::

    GET  /api/v1/recommendations/trending/
    GET  /api/v1/recommendations/personalized/        (auth required)
    GET  /api/v1/recommendations/recently-viewed/
    GET  /api/v1/recommendations/<slug>/similar/
    GET  /api/v1/recommendations/<slug>/frequently-bought-together/
    POST /api/v1/products/<slug>/track-view/         (auth optional)

Every endpoint returns ``{ "count": int, "results": [serialized ...] }``
so the React carousel can hydrate its state from a single fetch.
"""
from __future__ import annotations

import logging
from typing import Any, Iterable

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response

from apps.categories.models import Category
from apps.products.models import Product, ProductStatus
from apps.products.serializers import ProductListSerializer
from apps.recommendations.services import ProductViewService
from apps.recommendations.strategies import (
    CoOccurrenceStrategy,
    ContentBasedStrategy,
    PersonalizedStrategy,
    RecentlyViewedStrategy,
    TrendingStrategy,
)

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 12
MAX_LIMIT = 50


# ---------------------------------------------------------------------------
# Hydration helper
# ---------------------------------------------------------------------------
def _hydrate(product_ids: Iterable[Any], *, slug_map: dict[str, Any] | None = None) -> list[dict]:
    """Resolve product IDs to serialized payloads in ranking order.

    ``slug_map`` is a pre-computed {slug: product_id} dict so the slug-based
    endpoints can resolve without an extra DB hit when the slug is provided.
    """
    ids = [pid for pid in product_ids if pid is not None]
    if not ids:
        return []
    qs = (
        Product.objects
        .filter(
            pk__in=ids,
            is_active=True,
            status=ProductStatus.ACTIVE,
        )
    )
    by_id = {str(p.pk): p for p in qs}
    ordered = [by_id[str(pid)] for pid in ids if str(pid) in by_id]
    return ProductListSerializer(ordered, many=True).data


def _limit_from_request(request: Request, default: int = DEFAULT_LIMIT) -> int:
    raw = request.query_params.get("limit")
    try:
        n = int(raw) if raw is not None else default
    except (TypeError, ValueError):
        return default
    return max(1, min(n, MAX_LIMIT))


# ---------------------------------------------------------------------------
# Trending
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def trending(request: Request) -> Response:
    """Global trending feed (category filter optional via ?category=<slug-or-id>).

    The frontend only knows the category slug (from ``/categories/:slug``),
    so we resolve the slug to the UUID primary key before passing it to the
    strategy. A raw UUID is also accepted for forward compatibility.
    """
    limit = _limit_from_request(request)
    cat_raw = request.query_params.get("category")
    category_id: str | None = None
    if cat_raw:
        # 1. Try direct UUID match (forward-compatible, e.g. admin tooling).
        try:
            if Category.objects.filter(pk=cat_raw, is_active=True).exists():
                category_id = cat_raw
        except (TypeError, ValueError):
            pass
        # 2. Fall back to slug lookup (what the frontend actually sends).
        if not category_id:
            cat = Category.objects.filter(slug=cat_raw, is_active=True).only("id").first()
            if cat is not None:
                category_id = str(cat.id)
    ids = TrendingStrategy().get_recommendations(
        context={"category_id": category_id},
        limit=limit,
    )
    return Response({
        "count": len(ids),
        "source": "trending",
        "results": _hydrate(ids),
    })


# ---------------------------------------------------------------------------
# Personalized
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def personalized(request: Request) -> Response:
    """The logged-in viewer's personalized feed."""
    limit = _limit_from_request(request)
    ids = PersonalizedStrategy().get_recommendations(
        context={"user_id": request.user.id},
        limit=limit,
    )
    return Response({
        "count": len(ids),
        "source": "personalized",
        "results": _hydrate(ids),
    })


# ---------------------------------------------------------------------------
# Recently viewed
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def recently_viewed(request: Request) -> Response:
    """The viewer's most-recent products (user or anonymous session)."""
    limit = _limit_from_request(request)
    context: dict[str, Any] = {}
    if request.user.is_authenticated:
        context["user_id"] = request.user.id
    else:
        # Frontend sends an X-Session-Key header on every request.
        context["session_key"] = (
            request.headers.get("X-Session-Key", "") or ""
        )
    if not context:
        return Response({"count": 0, "source": "recently-viewed", "results": []})
    ids = RecentlyViewedStrategy().get_recommendations(
        context=context,
        limit=limit,
    )
    return Response({
        "count": len(ids),
        "source": "recently-viewed",
        "results": _hydrate(ids),
    })


# ---------------------------------------------------------------------------
# Similar (content-based)
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def similar_products(request: Request, slug: str) -> Response:
    limit = _limit_from_request(request)
    product = get_object_or_404(
        Product, slug=slug, is_active=True, status=ProductStatus.ACTIVE,
    )
    ids = ContentBasedStrategy().get_recommendations(
        context={"product_id": product.id},
        limit=limit,
    )
    return Response({
        "count": len(ids),
        "source": "similar",
        "results": _hydrate(ids),
    })


# ---------------------------------------------------------------------------
# Frequently-bought-together (co-occurrence)
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def frequently_bought_together(request: Request, slug: str) -> Response:
    limit = _limit_from_request(request)
    product = get_object_or_404(
        Product, slug=slug, is_active=True, status=ProductStatus.ACTIVE,
    )
    ids = CoOccurrenceStrategy().get_recommendations(
        context={"product_id": product.id},
        limit=limit,
    )
    return Response({
        "count": len(ids),
        "source": "frequently-bought-together",
        "results": _hydrate(ids),
    })


# ---------------------------------------------------------------------------
# Track-view action (POST) -- mounted on the products router, kept here
# so the recommendations app owns the implementation. The router action
# lives in ``apps/products/views.py`` and forwards to ``track_view``.
# ---------------------------------------------------------------------------
def track_view_for_product(
    request: Request,
    *,
    slug: str,
    session_key: str = "",
    ip_address: str = "",
) -> Response:
    """Persist a ProductView for the given product slug."""
    product = get_object_or_404(
        Product, slug=slug, is_active=True, status=ProductStatus.ACTIVE,
    )
    user = request.user if request.user.is_authenticated else None
    session_key = session_key or request.headers.get("X-Session-Key", "")
    row = ProductViewService.track_view(
        product=product,
        user=user,
        session_key=session_key,
        ip_address=ip_address,
    )
    return Response(
        {
            "tracked": True,
            "id": str(row.id),
            "product": str(row.product_id),
            "viewed_at": row.viewed_at.isoformat(),
        },
        status=status.HTTP_202_ACCEPTED,
    )
