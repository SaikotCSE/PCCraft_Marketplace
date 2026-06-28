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