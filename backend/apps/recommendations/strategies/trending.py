"""Trending strategy (Module 7).

Score per product in the last 7 days:
    score = (purchase_count * 0.6) + (view_count * 0.4)

Excludes out-of-stock products (``stock_quantity == 0``) and cancelled
orders. Optional category filter. Result cached at
``rec:trending:global`` or ``rec:trending:cat:{category_id}`` for 1
hour.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from apps.orders.models import OrderItem, OrderStatus
from apps.products.models import Product, ProductStatus
from apps.recommendations.cache import cached_list
from apps.recommendations.engine import RecommendationStrategy
from apps.recommendations.models import ProductView

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 60 * 60  # 1 hour per spec §7.1
PURCHASE_WEIGHT = 0.6
VIEW_WEIGHT = 0.4
WINDOW_DAYS = 7


class TrendingStrategy(RecommendationStrategy):
    """Most-popular-now leaderboard, optionally scoped to a category."""

    def get_recommendations(self, context: dict, limit: int) -> list[int]:
        if limit <= 0:
            return []
        category_id = context.get("category_id")
        cache_key = (
            f"rec:trending:cat:{category_id}"
            if category_id
            else "rec:trending:global"
        )

        def _compute() -> list[int]:
            try:
                window_start = timezone.now() - timedelta(days=WINDOW_DAYS)
                product_qs = (
                    Product.objects
                    .filter(is_active=True, status=ProductStatus.ACTIVE)
                    .filter(stock_quantity__gt=0)
                )
                if category_id:
                    product_qs = product_qs.filter(category_id=category_id)

                # purchases: distinct product_ids in OrderItem joined to non-cancelled orders
                # in the window.
                purchase_rows = (
                    OrderItem.objects
                    .filter(
                        is_active=True,
                        product__isnull=False,
                        order__is_active=True,
                        order__created_at__gte=window_start,
                    )
                    .exclude(order__status=OrderStatus.CANCELLED)
                    .values("product_id")
                    .annotate(c=Count("id"))
                )
                if category_id:
                    purchase_rows = purchase_rows.filter(
                        product__category_id=category_id,
                    )
                purchase_map = {row["product_id"]: row["c"] for row in purchase_rows}

                # views: count of ProductView rows in the window per product.
                view_rows = (
                    ProductView.objects
                    .filter(viewed_at__gte=window_start)
                    .values("product_id")
                    .annotate(c=Count("id"))
                )
                if category_id:
                    view_rows = view_rows.filter(
                        product__category_id=category_id,
                    )
                view_map = {row["product_id"]: row["c"] for row in view_rows}

                # Union the candidate set; restrict to in-stock ACTIVE.
                product_ids = set(purchase_map) | set(view_map)
                if not product_ids:
                    # Pure no-signal fallback: surface the newest
                    # in-stock ACTIVE products ordered by sales counter
                    # so we never return an empty feed on a quiet site.
                    return list(
                        product_qs.order_by("-total_sold", "-created_at")
                        .values_list("id", flat=True)[:limit]
                    )
                # Drop any product that no longer matches the active/in-stock filter.
                product_ids &= set(
                    product_qs.filter(id__in=list(product_ids))
                    .values_list("id", flat=True)
                )
                if not product_ids:
                    return []

                scored: list[tuple[int, float]] = []
                for pid in product_ids:
                    score = (
                        purchase_map.get(pid, 0) * PURCHASE_WEIGHT
                        + view_map.get(pid, 0) * VIEW_WEIGHT
                    )
                    scored.append((pid, score))
                scored.sort(key=lambda t: t[1], reverse=True)
                return [pid for pid, _ in scored[:limit]]
            except Exception:  # noqa: BLE001 -- spec: never raise
                logger.exception("TrendingStrategy failed")
                return []

        return cached_list(cache_key, CACHE_TTL_SECONDS, _compute)
