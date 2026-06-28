"""Recommendation engine -- strategy pattern (Module 7).

Every concrete recommendation source (content-based, co-occurrence,
trending, recently-viewed, personalized) is a ``RecommendationStrategy``
subclass. The ``RecommendationMixer`` blends several strategies with
weights so future endpoints (e.g. "homepage" or "checkout" feeds) can
mix the same primitives differently.

Specs the contract:

* ``get_recommendations`` must NEVER raise -- return ``[]`` on error.
  The mixer depends on this for fault-tolerance.
* Returned items are *product IDs* (integers for ``Product.id``
  primary keys) ranked by relevance (best first). The view layer
  hydrates them into ``ProductListSerializer`` data.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Iterable, Sequence

logger = logging.getLogger(__name__)


class RecommendationStrategy(ABC):
    """Strategy interface for a single recommendation source."""

    @abstractmethod
    def get_recommendations(self, context: dict, limit: int) -> list[int]:
        """Return up to ``limit`` product IDs, best first.

        ``context`` is opaque to the mixer; each strategy interprets
        the keys it cares about (e.g. ``product_id``, ``user_id``,
        ``category_id``). Implementations must never raise -- return
        an empty list on any failure.
        """

    # Helpers ----------------------------------------------------------
    @staticmethod
    def _dedupe_preserve_order(ids: Iterable[int]) -> list[int]:
        seen: set[int] = set()
        out: list[int] = []
        for pid in ids:
            if pid in seen:
                continue
            seen.add(pid)
            out.append(pid)
        return out


class RecommendationMixer:
    """Weighted blending of multiple strategies.

    Scoring (spec §7.1): for each strategy, fetch up to ``limit*2``
    candidate IDs, then accumulate ``weight * (fetch_limit - position)``
    into a composite score per product. Sort by score desc, drop
    duplicates, return the top ``limit`` IDs.
    """

    def __init__(self, strategies: Sequence[tuple[RecommendationStrategy, float]]):
        if not strategies:
            raise ValueError("RecommendationMixer needs at least one strategy.")
        self.strategies = list(strategies)

    def get_mixed(self, context: dict, limit: int) -> list[int]:
        if limit <= 0:
            return []
        fetch_limit = max(limit * 2, limit)
        scores: dict[int, float] = {}
        for strategy, weight in self.strategies:
            try:
                ids = strategy.get_recommendations(context, limit=fetch_limit)
            except Exception:  # noqa: BLE001 -- spec: never raise
                logger.exception(
                    "Strategy %s raised; skipping.", strategy.__class__.__name__,
                )
                continue
            if weight <= 0:
                continue
            for pos, pid in enumerate(ids):
                # Higher position = lower score.
                scores[pid] = scores.get(pid, 0.0) + weight * (fetch_limit - pos)
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        return [pid for pid, _ in ranked[:limit]]
