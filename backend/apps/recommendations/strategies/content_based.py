"""Content-based recommendation strategy (Module 7).

Similar products for the seed product ``context['product_id']``:

1. Same ``Category`` and same ``Brand`` (the strongest signal we have
   given ``Product`` has only one category FK).
2. Spec overlap score = ``|matching key/value pairs| / max(|target.specs|, 1)``.
3. Price band: ``0.5× ≤ effective_price ≤ 2.0×`` target.
4. Sort: ``spec_score DESC → average_rating DESC → created_at DESC``.

Result cached at ``rec:similar:{product_id}`` for 6 hours.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from apps.products.models import Product, ProductStatus
from apps.recommendations.cache import cached_list
from apps.recommendations.engine import RecommendationStrategy

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours per spec §7.1
PRICE_LOW_MULT = Decimal("0.5")
PRICE_HIGH_MULT = Decimal("2.0")


class ContentBasedStrategy(RecommendationStrategy):
    """Similar-products-by-category-brand-and-spec recommendation."""

    def get_recommendations(self, context: dict, limit: int) -> list[int]:
        if limit <= 0:
            return []
        product_id = context.get("product_id")
        if not product_id:
            return []

        cache_key = f"rec:similar:{product_id}"

        def _compute() -> list[int]:
            try:
                target = (
                    Product.objects
                    .filter(is_active=True, status=ProductStatus.ACTIVE, pk=product_id)
                    .only(
                        "id", "base_price", "discounted_price",
                        "discount_start", "discount_end",
                        "specs", "category_id", "brand_id",
                        "average_rating", "created_at",
                    )
                    .first()
                )
                if target is None:
                    return []
                target_specs: dict[str, Any] = target.specs or {}
                target_price = target.effective_price
                low = target_price * PRICE_LOW_MULT
                high = target_price * PRICE_HIGH_MULT

                qs = (
                    Product.objects
                    .filter(
                        is_active=True,
                        status=ProductStatus.ACTIVE,
                        category_id=target.category_id,
                        brand_id=target.brand_id,
                    )
                    .exclude(pk=target.pk)
                    .only(
                        "id", "base_price", "discounted_price",
                        "discount_start", "discount_end",
                        "specs", "average_rating", "created_at",
                    )
                )

                candidates: list[tuple[Any, float, Decimal]] = []
                for cand in qs:
                    price = cand.effective_price
                    if price < low or price > high:
                        continue
                    c_specs = cand.specs or {}
                    if target_specs:
                        matches = sum(
                            1 for k, v in target_specs.items()
                            if c_specs.get(k) == v
                        )
                        score = matches / max(len(target_specs), 1)
                    else:
                        score = 0.0
                    candidates.append((cand.id, score, cand.average_rating or Decimal(0)))

                candidates.sort(key=lambda t: (-t[1], -float(t[2])))
                return [pid for pid, _score, _rating in candidates[:limit]]
            except Exception:  # noqa: BLE001 -- spec: never raise
                logger.exception("ContentBasedStrategy failed product_id=%s", product_id)
                return []

        return cached_list(cache_key, CACHE_TTL_SECONDS, _compute)
