"""HTTP API for Module 11 — search, suggestions, trending, zero-result, analytics.

Endpoints (mounted under ``/api/v1/search/`` and ``/api/v1/analytics/``)::

    GET  /api/v1/search/                          — full-text + faceted search
    GET  /api/v1/search/suggestions/              — live autocomplete
    GET  /api/v1/search/trending/                 — top 10 queries (last 7 days)
    GET  /api/v1/search/zero-result/              — staff-only zero-result report
    GET  /api/v1/analytics/search/                — staff-only aggregate metrics

All endpoints return a single envelope shape. The pagination envelope for
``/search/`` mirrors the rest of the catalog so the React grid can hydrate
identically.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.pagination import StandardResultsPagination
from apps.common.response import APIResponse
from apps.products.models import Product, ProductStatus
from apps.products.serializers import ProductListSerializer
from apps.products.services import ProductSearchService
from apps.recommendations.models import SearchLog
from apps.recommendations.services import SearchLogService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pagination + sort helpers
# ---------------------------------------------------------------------------
class SearchPagination(StandardResultsPagination):
    """Per spec §11.1: page_size max 40."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = ProductSearchService.MAX_PAGE_SIZE


def _split_csv(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in str(raw).split(",") if s.strip()]


def _parse_bool(raw: str | None) -> bool | None:
    if raw is None or raw == "":
        return None
    return str(raw).lower() in ("1", "true", "yes", "y", "on")


def _parse_float(raw: str | None) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# /api/v1/search/
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def search_products(request: Request) -> Response:
    """Full-text + faceted product search (Module 11 §11.1)."""
    qp = request.query_params
    q = (qp.get("q") or "").strip()
    ordering = (qp.get("ordering") or "").strip()
    min_price = _parse_float(qp.get("min_price"))
    max_price = _parse_float(qp.get("max_price"))
    min_rating = _parse_float(qp.get("min_rating"))
    in_stock = _parse_bool(qp.get("in_stock"))
    discount = _parse_bool(qp.get("discount"))
    vendor = (qp.get("vendor") or "").strip() or None
    category_slugs = _split_csv(qp.get("category"))
    brand_slugs = _split_csv(qp.get("brand"))

    qs = ProductSearchService.build_queryset(
        q=q,
        category_slugs=category_slugs,
        brand_slugs=brand_slugs,
        min_price=min_price,
        max_price=max_price,
        in_stock=in_stock,
        discount=discount,
        min_rating=min_rating,
        vendor_id=vendor,
        ordering=ordering,
    )

    paginator = SearchPagination()
    page = paginator.paginate_queryset(qs, request, view=None)
    serialized = ProductListSerializer(page, many=True, context={"request": request}).data
    response = paginator.get_paginated_response(serialized)
    total = response.data["meta"]["pagination"]["total_items"]

    # Async log the query — never block the response on it.
    user = request.user if request.user.is_authenticated else None
    SearchLogService.record_async(
        query=q,
        results_count=int(total),
        user_id=getattr(user, "id", None),
    )

    # Echo the active filters so the React chips row can render without
    # re-parsing the URL.
    response.data["meta"]["query"] = q
    response.data["meta"]["filters"] = {
        "category": category_slugs,
        "brand": brand_slugs,
        "min_price": min_price,
        "max_price": max_price,
        "in_stock": in_stock,
        "discount": discount,
        "min_rating": min_rating,
        "vendor": vendor,
        "ordering": ordering or (ProductSearchService.DEFAULT_SORT if q else "-created_at"),
    }
    return response


# ---------------------------------------------------------------------------
# /api/v1/search/suggestions/
# ---------------------------------------------------------------------------
SUGGEST_CACHE_TTL = 5 * 60  # 5 minutes per spec §11.1
SUGGEST_PRODUCT_LIMIT = 5
SUGGEST_CATEGORY_LIMIT = 3


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def search_suggestions(request: Request) -> Response:
    """Live autocomplete — product names + category names.

    Cached in Redis for 5 min per normalised query. Returns up to 5
    products + up to 3 categories, with the matched name in plain text
    so the frontend can build a dropdown without re-fetching.
    """
    raw_q = (request.query_params.get("q") or "").strip()
    if len(raw_q) < 2:
        return APIResponse(
            data={"products": [], "categories": []},
            meta={"query": raw_q},
        )

    q = SearchLogService.normalize(raw_q)
    if len(q) < 2:
        return APIResponse(
            data={"products": [], "categories": []},
            meta={"query": q},
        )
    cache_key = f"search:suggest:{q.lower()}"

    cached = _cache_get_json(cache_key)
    if cached is not None:
        products = cached.get("products", [])
        categories = cached.get("categories", [])
    else:
        products = []
        for p in (
            Product.objects.filter(
                is_active=True,
                status=ProductStatus.ACTIVE,
                name__icontains=q,
            )
            .order_by("-total_sold", "name")
            .only("id", "name", "slug")[: SUGGEST_PRODUCT_LIMIT]
        ):
            products.append(
                {
                    "id": str(p.id),
                    "name": p.name,
                    "slug": p.slug,
                }
            )
        from apps.categories.models import Category
        categories = list(
            Category.objects.filter(is_active=True, name__icontains=q)
            .order_by("name")
            .values("id", "name", "slug")[: SUGGEST_CATEGORY_LIMIT]
        )
        # Category values() gives UUIDs which Django's cache layer can
        # pickle; we leave them as-is since DRF renders UUIDs in JSON.
        _cache_set_json(
            cache_key,
            {"products": products, "categories": categories},
            ttl=SUGGEST_CACHE_TTL,
        )
    return APIResponse(
        data={"products": products, "categories": categories},
        meta={"query": q, "count": len(products) + len(categories)},
    )


# ---------------------------------------------------------------------------
# Generic cache helper (JSON-safe, datetime/Decimal aware)
# ---------------------------------------------------------------------------
def _cache_get_json(key: str):
    try:
        return cache.get(key)
    except Exception:  # noqa: BLE001
        logger.warning("search cache GET failed key=%s; computing live", key)
        return None


def _cache_set_json(key: str, value, *, ttl: int) -> None:
    try:
        cache.set(key, value, timeout=ttl)
    except Exception:  # noqa: BLE001
        logger.warning("search cache SET failed key=%s; skipping write", key)


# ---------------------------------------------------------------------------
# /api/v1/search/trending/
# ---------------------------------------------------------------------------
TRENDING_LIMIT = 10
TRENDING_WINDOW_DAYS = 7
TRENDING_CACHE_TTL = 60 * 60  # 1 hour per spec §11.1


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def search_trending(request: Request) -> Response:
    """Top ``TRENDING_LIMIT`` most-frequent non-zero queries in the last 7 days."""
    cache_key = "search:trending:queries"
    cached = _cache_get_json(cache_key)
    if cached is not None:
        rows = cached
    else:
        cutoff = timezone.now() - timedelta(days=TRENDING_WINDOW_DAYS)
        agg = (
            SearchLog.objects
            .filter(timestamp__gte=cutoff, results_count__gt=0)
            .values("query")
            .annotate(c=Count("id"))
            .order_by("-c", "query")[: TRENDING_LIMIT]
        )
        rows = [{"query": r["query"], "count": r["c"]} for r in agg]
        _cache_set_json(cache_key, rows, ttl=TRENDING_CACHE_TTL)

    return APIResponse(
        data={"results": rows},
        meta={"window_days": TRENDING_WINDOW_DAYS, "limit": TRENDING_LIMIT},
    )


# ---------------------------------------------------------------------------
# /api/v1/search/zero-result/  (staff)
# ---------------------------------------------------------------------------
ZERO_RESULT_WINDOW_DAYS = 30
ZERO_RESULT_PAGE_SIZE = 50


@api_view(["GET"])
@permission_classes([permissions.IsAdminUser])
def zero_result_queries(request: Request) -> Response:
    """Staff-only: list queries that returned zero results in the last 30 days."""
    cutoff = timezone.now() - timedelta(days=ZERO_RESULT_WINDOW_DAYS)
    limit_raw = request.query_params.get("limit") or ZERO_RESULT_PAGE_SIZE
    try:
        limit = max(1, min(int(limit_raw), 200))
    except (TypeError, ValueError):
        limit = ZERO_RESULT_PAGE_SIZE

    rows = (
        SearchLog.objects
        .filter(timestamp__gte=cutoff, results_count=0)
        .values("query")
        .annotate(c=Count("id"))
        .order_by("-c", "query")[:limit]
    )
    results = [{"query": r["query"], "count": r["c"]} for r in rows]
    return APIResponse(
        data={"results": results},
        meta={
            "window_days": ZERO_RESULT_WINDOW_DAYS,
            "limit": limit,
        },
    )


# ---------------------------------------------------------------------------
# /api/v1/analytics/search/  (staff)
# ---------------------------------------------------------------------------
ANALYTICS_DEFAULT_DAYS = 30
ANALYTICS_MAX_DAYS = 365
ANALYTICS_CACHE_TTL = 5 * 60  # 5 min — staff-only, low-traffic


@api_view(["GET"])
@permission_classes([permissions.IsAdminUser])
def search_analytics(request: Request) -> Response:
    """Staff-only: aggregate search metrics (Module 11 §11.3)."""
    days_raw = request.query_params.get("days") or ANALYTICS_DEFAULT_DAYS
    try:
        days = max(1, min(int(days_raw), ANALYTICS_MAX_DAYS))
    except (TypeError, ValueError):
        days = ANALYTICS_DEFAULT_DAYS
    cutoff = timezone.now() - timedelta(days=days)

    cache_key = f"search:analytics:{days}"
    cached = _cache_get_json(cache_key)
    if cached is not None:
        return APIResponse(data=cached, meta={"days": days, "cached": True})

    base = SearchLog.objects.filter(timestamp__gte=cutoff)
    total_searches = base.count()
    zero_result = base.filter(results_count=0).count()
    unique_users = base.exclude(user__isnull=True).values("user_id").distinct().count()
    unique_queries = base.values("query").distinct().count()

    top_qs = (
        base.filter(results_count__gt=0)
        .values("query")
        .annotate(c=Count("id"))
        .order_by("-c")[:10]
    )
    top_queries = [{"query": r["query"], "count": r["c"]} for r in top_qs]

    from django.db.models.functions import TruncDate
    daily = (
        base.annotate(day=TruncDate("timestamp"))
        .values("day")
        .annotate(c=Count("id"))
        .order_by("day")
    )
    daily_series = [{"date": r["day"].isoformat(), "count": r["c"]} for r in daily]

    payload = {
        "window_days": days,
        "total_searches": total_searches,
        "zero_result_searches": zero_result,
        "zero_result_rate": (
            round(zero_result / total_searches, 4) if total_searches else 0.0
        ),
        "unique_users": unique_users,
        "unique_queries": unique_queries,
        "top_queries": top_queries,
        "daily": daily_series,
    }
    _cache_set_json(cache_key, payload, ttl=ANALYTICS_CACHE_TTL)
    return APIResponse(data=payload, meta={"days": days, "cached": False})
