"""Celery tasks for the recommendations app (Module 7 spec §7.4 + Module 11).

Scheduled jobs:

* ``warm_trending_cache`` -- every 15 min, recomputes the global and
  per-category trending leaderboards.
* ``warm_co_occurrence_cache`` -- every 30 min, recomputes the
  co-occurrence feed for every ACTIVE product (capped to last 90 days).
* ``warm_all_personalized`` -- nightly at 03:00 UTC, recomputes the
  personalized feed for the top 100 most-recent active buyers.
* ``purge_stale_product_views`` -- nightly at 04:00 UTC, deletes
  ``ProductView`` rows older than 90 days.

Fire-and-forget jobs:

* ``log_search_event`` (Module 11) -- one row per search query,
  dispatched from the search endpoint to keep request latency flat.

Wired into ``CELERY_BEAT_SCHEDULE`` by ``apps.recommendations.apps``.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.products.models import Product, ProductStatus
from apps.recommendations.cache import invalidate
from apps.recommendations.models import ProductView
from apps.recommendations.strategies import (
    CoOccurrenceStrategy,
    PersonalizedStrategy,
    TrendingStrategy,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Trending
# ---------------------------------------------------------------------------
@shared_task(name="apps.recommendations.warm_trending_cache")
def warm_trending_cache(limit: int = 24) -> int:
    """Recompute global + per-category trending leaderboards."""
    try:
        # Bust first so the next reader pays the recompute cost.
        invalidate("rec:trending:global")
        ids = TrendingStrategy().get_recommendations(
            context={"category_id": None},
            limit=limit,
        )
        for cat_id in (
            Product.objects
            .filter(is_active=True, status=ProductStatus.ACTIVE)
            .values_list("category_id", flat=True)
            .distinct()
        ):
            invalidate(f"rec:trending:cat:{cat_id}")
            TrendingStrategy().get_recommendations(
                context={"category_id": cat_id},
                limit=limit,
            )
        return len(ids)
    except Exception:  # noqa: BLE001 -- never raise from a beat job
        logger.exception("warm_trending_cache failed")
        return 0


# ---------------------------------------------------------------------------
# Co-occurrence
# ---------------------------------------------------------------------------
@shared_task(name="apps.recommendations.warm_co_occurrence_cache")
def warm_co_occurrence_cache(batch_size: int = 200) -> int:
    """Recompute co-occurrence feed for every ACTIVE product."""
    try:
        active_ids = list(
            Product.objects
            .filter(is_active=True, status=ProductStatus.ACTIVE)
            .values_list("id", flat=True)
        )
        warmed = 0
        for pid in active_ids:
            invalidate(f"rec:co_occur:{pid}")
            CoOccurrenceStrategy().get_recommendations(
                context={"product_id": pid},
                limit=10,
            )
            warmed += 1
            if warmed >= batch_size:
                break
        return warmed
    except Exception:  # noqa: BLE001
        logger.exception("warm_co_occurrence_cache failed")
        return 0


# ---------------------------------------------------------------------------
# Personalized
# ---------------------------------------------------------------------------
@shared_task(name="apps.recommendations.warm_all_personalized")
def warm_all_personalized(limit_users: int = 100) -> int:
    """Recompute personalized feed for the top-N most recent buyers."""
    try:
        from django.contrib.auth import get_user_model
        from django.db.models import Max

        User = get_user_model()
        # Heuristic: users with the most recent Order.created_at first.
        candidate_user_ids = []
        # Simple fallback if the join is too expensive on the dev box.
        try:
            from apps.orders.models import Order  # noqa: WPS433
            candidate_user_ids = list(
                Order.objects
                .filter(is_active=True)
                .values("user_id")
                .annotate(last=Max("created_at"))
                .order_by("-last")
                .values_list("user_id", flat=True)[:limit_users]
            )
        except Exception:
            candidate_user_ids = []
        if not candidate_user_ids:
            candidate_user_ids = list(
                User.objects.filter(is_active=True)
                .order_by("-last_login")
                .values_list("id", flat=True)[:limit_users]
            )
        for uid in candidate_user_ids:
            invalidate(f"rec:personal:{uid}")
            PersonalizedStrategy().get_recommendations(
                context={"user_id": uid},
                limit=12,
            )
        return len(candidate_user_ids)
    except Exception:  # noqa: BLE001
        logger.exception("warm_all_personalized failed")
        return 0


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------
@shared_task(name="apps.recommendations.purge_stale_product_views")
def purge_stale_product_views(retention_days: int = 90) -> int:
    """Delete ProductView rows older than the retention window."""
    try:
        cutoff = timezone.now() - timedelta(days=retention_days)
        deleted, _ = ProductView.objects.filter(viewed_at__lt=cutoff).delete()
        logger.info("purge_stale_product_views removed %s rows", deleted)
        return int(deleted or 0)
    except Exception:  # noqa: BLE001
        logger.exception("purge_stale_product_views failed")
        return 0


# ---------------------------------------------------------------------------
# Module 11 -- async search-query logging
# ---------------------------------------------------------------------------
@shared_task(name="apps.recommendations.log_search_event", bind=True, max_retries=3, default_retry_delay=10)
def log_search_event(self, *, query: str, results_count: int, user_id: int | None = None) -> int:
    """Insert a SearchLog row on behalf of the search endpoint.

    Fire-and-forget: dispatched by ``SearchLogService.record_async`` so
    the request handler never blocks on a database write. Retries up
    to three times on transient failures.
    """
    from apps.recommendations.models import SearchLog
    from apps.recommendations.services import SearchLogService

    q = SearchLogService.normalize(query)
    if len(q) < SearchLogService.MIN_QUERY_LEN:
        return 0
    try:
        SearchLog.objects.create(
            query=q,
            user_id=user_id,
            results_count=int(results_count),
        )
        return 1
    except Exception as exc:  # noqa: BLE001
        logger.exception("log_search_event failed for q=%r", q)
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            return 0
