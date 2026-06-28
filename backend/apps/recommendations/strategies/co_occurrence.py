"""Co-occurrence (Frequently-Bought-Together) strategy (Module 7).

Finds orders that contain the seed product and counts which other
products most often appear in the same order. Restricted to orders in
shipped-or-later states so abandoned carts don't pollute the ranking.

Result cached at ``rec:co_occur:{product_id}`` for 12 hours.
"""
from __future__ import annotations

import logging

from django.db.models import Count

from apps.orders.models import OrderItem, OrderStatus
from apps.recommendations.cache import cached_list
from apps.recommendations.engine import RecommendationStrategy

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 12 * 60 * 60  # 12 hours per spec §7.1

# Statuses the spec explicitly allows for the co-purchase signal.
_INCLUDED_ORDER_STATUSES = (
    OrderStatus.DELIVERED,
    OrderStatus.SHIPPED,
    OrderStatus.OUT_FOR_DELIVERY,
)


class CoOccurrenceStrategy(RecommendationStrategy):
    """Frequently-bought-together via order co-occurrence."""

    def get_recommendations(self, context: dict, limit: int) -> list[int]:
        if limit <= 0:
            return []
        product_id = context.get("product_id")
        if not product_id:
            return []

        cache_key = f"rec:co_occur:{product_id}"

        def _compute() -> list[int]:
            try:
                # Defensive: orders app may not have OrderItem registered
                # yet on a fresh install (the ``try/except`` in
                # ``PublicProductListView.trending`` is the same pattern).
                if OrderItem is None:
                    return []
                order_ids = list(
                    OrderItem.objects
                    .filter(
                        product_id=product_id,
                        order__is_active=True,
                        order__status__in=list(_INCLUDED_ORDER_STATUSES),
                        is_active=True,
                    )
                    .values_list("order_id", flat=True)
                    .distinct()
                )
                if not order_ids:
                    return []
                co = (
                    OrderItem.objects
                    .filter(
                        order_id__in=order_ids,
                        is_active=True,
                        product__isnull=False,
                    )
                    .exclude(product_id=product_id)
                    .values("product_id")
                    .annotate(c=Count("id"))
                    .order_by("-c")[:limit]
                )
                return [row["product_id"] for row in co]
            except Exception:  # noqa: BLE001 -- spec: never raise
                logger.exception("CoOccurrenceStrategy failed product_id=%s", product_id)
                return []

        return cached_list(cache_key, CACHE_TTL_SECONDS, _compute)
