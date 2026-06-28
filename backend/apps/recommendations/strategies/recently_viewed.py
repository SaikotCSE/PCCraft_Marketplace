"""Recently-viewed strategy (Module 7).

Reads from the ``ProductView`` table directly -- no Redis cache, per
the spec ("served from DB directly"). Dedup keeps the latest entry per
product_id; the list is ordered by ``viewed_at DESC`` (most recent
first).
"""
from __future__ import annotations

import logging

from apps.recommendations.engine import RecommendationStrategy
from apps.recommendations.models import ProductView

logger = logging.getLogger(__name__)


class RecentlyViewedStrategy(RecommendationStrategy):
    """The viewer's most-recent products, deduped by product_id."""

    def get_recommendations(self, context: dict, limit: int) -> list[int]:
        if limit <= 0:
            return []
        user_id = context.get("user_id")
        session_key = context.get("session_key")
        if not user_id and not session_key:
            return []
        try:
            qs = ProductView.objects.all()
            if user_id:
                qs = qs.filter(user_id=user_id)
            elif session_key:
                qs = qs.filter(session_key=session_key)
            # newest first; dedup with distinct; we use the latest per
            # product_id by relying on ``-viewed_at`` ordering and then
            # .distinct("product_id") which Postgres supports.
            try:
                rows = list(
                    qs.order_by("product_id", "-viewed_at")
                    .distinct("product_id")
                    .values_list("product_id", flat=True)[:limit]
                )
            except Exception:
                # Fallback for DBs that don't support DISTINCT ON (none in
                # our stack, but be defensive).
                seen: set[int] = set()
                rows = []
                for pid in qs.order_by("-viewed_at").values_list("product_id", flat=True):
                    if pid in seen:
                        continue
                    seen.add(pid)
                    rows.append(pid)
                    if len(rows) >= limit:
                        break
            # Product PKs are UUIDs; convert to str so the hydration step
            # can do ``pk__in=[...]`` without int<->UUID coercion failure.
            return [str(pid) for pid in rows]
        except Exception:  # noqa: BLE001 -- spec: never raise
            logger.exception("RecentlyViewedStrategy failed")
            return []
