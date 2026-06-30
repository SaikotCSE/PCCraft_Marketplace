"""Domain services for the recommendations app (Module 7).

Single public entry point today: ``ProductViewService.track_view``.
Dedupes consecutive views of the same product from the same
viewer (user or anonymous session) within a 30-minute window by
updating the latest ``ProductView.viewed_at`` instead of inserting a
new row -- per spec §7.2 ("30 minutes dedup window").
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import CustomUser
from apps.products.models import Product
from apps.recommendations.cache import invalidate
from apps.recommendations.models import ProductView

logger = logging.getLogger(__name__)


class ProductViewService:
    """Records product-view events and busts the affected caches."""

    DEDUP_WINDOW = timedelta(minutes=30)
    PERSONAL_CACHE_TTL_HINT_SECONDS = 24 * 60 * 60

    @classmethod
    @transaction.atomic
    def track_view(
        cls,
        *,
        product: Product,
        user: Optional[CustomUser] = None,
        session_key: str = "",
        ip_address: str = "",
    ) -> ProductView:
        """Persist a view event, deduping within a 30-minute window.

        Returns the existing row if dedup hit, otherwise a new row.
        """
        if not isinstance(product, Product):
            # Guard against bad callers passing a slug string.
            raise TypeError("product must be a Product instance")

        viewer_id = getattr(user, "id", None) if user is not None else None
        window_start = timezone.now() - cls.DEDUP_WINDOW

        # 1. Try to dedup against the latest matching row.
        existing_qs = ProductView.objects.filter(product_id=product.id)
        if viewer_id is not None:
            existing_qs = existing_qs.filter(user_id=viewer_id)
        else:
            existing_qs = existing_qs.filter(
                session_key=session_key or "",
                user__isnull=True,
            )
        existing = (
            existing_qs
            .filter(viewed_at__gte=window_start)
            .order_by("-viewed_at")
            .first()
        )
        if existing is not None:
            existing.viewed_at = timezone.now()
            existing.save(update_fields=["viewed_at", "updated_at"])
            cls._invalidate_after_view(product, user=viewer_id, session_key=session_key)
            return existing

        # 2. Otherwise insert a fresh row.
        row = ProductView.objects.create(
            user=user if user is not None else None,
            product=product,
            session_key=session_key or "",
        )
        cls._invalidate_after_view(product, user=viewer_id, session_key=session_key)
        return row

    # ------------------------------------------------------------------
    # Cache invalidation helpers
    # ------------------------------------------------------------------
    @classmethod
    def _invalidate_after_view(
        cls,
        product: Product,
        *,
        user: Optional[str] = None,
        session_key: str = "",
    ) -> None:
        """Best-effort cache busts after a new view event.

        Trending is refreshed by a Celery beat (15 min) so we only
        invalidate the personal feed here. The 30-min dedup window means
        rapid scrolling won't churn Redis -- but a real product page
        visit still busts its viewer's "you may also like" feed.
        """
        try:
            invalidate(f"rec:similar:{product.id}")
            invalidate(f"rec:co_occur:{product.id}")
            # Category-scoped trending key.
            if product.category_id is not None:
                invalidate(f"rec:trending:cat:{product.category_id}")
            # Global trending key (used on home page).
            invalidate("rec:trending:global")
            if user is not None:
                invalidate(f"rec:personal:{user}")
            # Anonymous viewer: bust a session-scoped recently-viewed feed.
            if session_key:
                # RecentlyViewed is not cached, but the mixer in
                # Personalized may read it. Tag a unique key.
                invalidate(f"rec:rv:{session_key}")
        except Exception:  # noqa: BLE001 -- spec: never raise
            logger.exception("cache invalidation failed for product=%s", product.id)


# ====================================================================
# SearchLogService — Module 11 search analytics
# ====================================================================
class SearchLogServiceError(Exception):
    """Raised when a search-log write fails irrecoverably.

    Module 11 explicitly requires logging to be **best-effort**: an
    analytics outage must never break search. View / task code wraps
    the call in ``try/except`` and swallows ``SearchLogServiceError``.
    """


class SearchLogService:
    """Persists search queries for analytics (Module 11 §11.1).

    Three entry points:

    * :meth:`normalize` — strip + lower-case + collapse whitespace;
      applies project-wide to anything that touches the search box.
    * :meth:`record_async` — fire-and-forget Celery dispatch so the
      search view never waits on the DB write.
    * :meth:`record` — synchronous writer used by tests + the Celery
      task itself.
    """

    MIN_QUERY_LEN = 3

    @staticmethod
    def normalize(raw: str | None) -> str:
        """Return a canonical form of ``raw`` for analytics + dedup keys.

        Strips surrounding whitespace, lower-cases the input and
        collapses internal whitespace runs to a single space. The
        result is empty when ``raw`` is falsy.

        Args:
            raw: Free-form query string captured from the search box.

        Returns:
            The normalized query, or ``""`` when ``raw`` is empty.
        """
        if not raw:
            return ""
        return " ".join(str(raw).strip().lower().split())

    @staticmethod
    def _resolve_user(user_id):
        if user_id in (None, ""):
            return None
        try:
            return CustomUser.objects.get(pk=user_id)
        except CustomUser.DoesNotExist:
            return None

    @staticmethod
    def record(*, query: str, results_count: int, user_id=None) -> None:
        """Synchronous insert. Used by :func:`record_search_event_task`."""
        from apps.recommendations.models import SearchLog

        normalized = SearchLogService.normalize(query)
        if len(normalized) < SearchLogService.MIN_QUERY_LEN:
            return
        try:
            user = SearchLogService._resolve_user(user_id)
            SearchLog.objects.create(
                query=normalized,
                results_count=max(0, int(results_count)),
                user=user,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("search log write failed: %s", exc)
            raise SearchLogServiceError(str(exc)) from exc

    @staticmethod
    def record_async(*, query: str, results_count: int, user_id=None) -> None:
        """Fire-and-forget Celery dispatch.

        Falls back to a synchronous write when no broker is configured
        so dev / EAGER mode still captures search events.
        """
        normalized = SearchLogService.normalize(query)
        if len(normalized) < SearchLogService.MIN_QUERY_LEN:
            return
        try:
            from apps.recommendations.tasks import log_search_event
            log_search_event.delay(
                query=normalized,
                results_count=int(results_count),
                user_id=str(user_id) if user_id else None,
            )
        except Exception:  # noqa: BLE001 -- broker down → fall back
            try:
                SearchLogService.record(
                    query=normalized,
                    results_count=results_count,
                    user_id=user_id,
                )
            except SearchLogServiceError:
                logger.exception("search log fallback write failed")