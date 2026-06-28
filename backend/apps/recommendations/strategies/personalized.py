"""Personalized recommendation strategy (Module 7).

User-user collaborative filtering in two lines:

1. Build ``user_vector`` = products the user has bought (DELIVERED) or viewed.
2. Find ``neighbor_users`` who share at least 2 product_ids with the
   vector; aggregate the *other* products they ordered; score = number
   of neighbors who ordered each.

Cold start (<3 distinct purchased+viewed products) → delegate to
``TrendingStrategy``.

Result cached at ``rec:personal:{user_id}`` for 24 hours.
"""
from __future__ import annotations

import logging

from django.db.models import Count

from apps.orders.models import OrderItem, OrderStatus
from apps.recommendations.cache import cached_list
from apps.recommendations.engine import RecommendationStrategy
from apps.recommendations.models import ProductView
from apps.recommendations.strategies.trending import TrendingStrategy

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 hours per spec §7.1
COLD_START_MIN_DISTINCT = 3
NEIGHBOR_OVERLAP_MIN = 2


class PersonalizedStrategy(RecommendationStrategy):
    """User-user collaborative filtering with cold-start fallback."""

    def get_recommendations(self, context: dict, limit: int) -> list[int]:
        if limit <= 0:
            return []
        user_id = context.get("user_id")
        if not user_id:
            return []

        cache_key = f"rec:personal:{user_id}"

        def _compute() -> list[int]:
            try:
                # 1. user_vector = (DELIVERED purchases ∪ views) for this user.
                purchased = set(
                    OrderItem.objects
                    .filter(
                        order__user_id=user_id,
                        order__is_active=True,
                        order__status=OrderStatus.DELIVERED,
                        is_active=True,
                        product__isnull=False,
                    )
                    .values_list("product_id", flat=True)
                    .distinct()
                )
                viewed = set(
                    ProductView.objects
                    .filter(user_id=user_id)
                    .values_list("product_id", flat=True)
                    .distinct()
                )
                user_vector = purchased | viewed

                if len(user_vector) < COLD_START_MIN_DISTINCT:
                    # Cold start → fall back to global trending.
                    return TrendingStrategy().get_recommendations(
                        context={"user_id": user_id}, limit=limit,
                    )

                if not user_vector:
                    return []

                # 2. neighbor_users = users sharing ≥2 product_ids with the vector.
                #    Use OrderItem to derive the neighbor set.
                neighbor_rows = (
                    OrderItem.objects
                    .filter(
                        product_id__in=list(user_vector),
                        order__is_active=True,
                        order__user__isnull=False,
                        is_active=True,
                    )
                    .exclude(order__user_id=user_id)
                    .values("order__user_id", "product_id")
                )
                overlap: dict[int, set[int]] = {}
                for row in neighbor_rows:
                    nu = row["order__user_id"]
                    if nu is None:
                        continue
                    overlap.setdefault(nu, set()).add(row["product_id"])
                neighbors = [
                    nu for nu, prods in overlap.items()
                    if len(prods & user_vector) >= NEIGHBOR_OVERLAP_MIN
                ]
                if not neighbors:
                    return TrendingStrategy().get_recommendations(
                        context={"user_id": user_id}, limit=limit,
                    )

                # 3. neighbor_products = products ordered by neighbors not in user_vector.
                neighbor_orders = (
                    OrderItem.objects
                    .filter(
                        order__user_id__in=neighbors,
                        order__is_active=True,
                        is_active=True,
                        product__isnull=False,
                    )
                    .exclude(product_id__in=list(user_vector))
                    .values("product_id")
                    .annotate(c=Count("order__user_id", distinct=True))
                    .order_by("-c")[:limit]
                )
                return [row["product_id"] for row in neighbor_orders]
            except Exception:  # noqa: BLE001 -- spec: never raise
                logger.exception("PersonalizedStrategy failed user_id=%s", user_id)
                return []

        return cached_list(cache_key, CACHE_TTL_SECONDS, _compute)
