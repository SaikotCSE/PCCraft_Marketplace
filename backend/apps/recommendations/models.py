"""Recommendation models -- Module 7.

The only persisted model is ``ProductView`` (one row per (user-or-session,
product) view), with a 30-minute dedup window enforced in the service
layer rather than via a DB unique constraint -- that lets the same row
get its ``viewed_at`` bumped in place instead of inserting duplicates.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.products.models import Product


class ProductView(TimeStampedModel):
    """A single (user-or-session, product) view event.

    * ``user`` and ``session_key`` are mutually reinforcing identifiers
      -- authenticated views have a ``user_id``; anonymous views have
      a ``session_key``. The service layer uses whichever is set.
    * 30-minute dedup is applied in :mod:`apps.recommendations.services`
      so a single row per (user, product) is normal even under heavy
      refresh traffic.
    * Indexed on ``(product, viewed_at)`` for the trending query and on
      ``(user, viewed_at)`` for the recently-viewed and personalized
      queries (both spec Module 7 §7.1).
    """

    id = models.BigAutoField(primary_key=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product_views",
        db_index=False,
        help_text="Null for anonymous views.",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="views",
    )
    viewed_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="Set on create; bumped on dedup hit.",
    )
    session_key = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="Opaque client-supplied key for anonymous tracking.",
    )

    class Meta:
        verbose_name = "Product view"
        verbose_name_plural = "Product views"
        ordering = ("-viewed_at",)
        indexes = [
            # Trending + co-occurrence lookups over a time window.
            models.Index(fields=("product", "viewed_at")),
            # Recently-viewed + personalized per-user scans.
            models.Index(fields=("user", "viewed_at")),
            # Anonymous session tracking.
            models.Index(fields=("session_key", "viewed_at")),
        ]

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        who = f"user={self.user_id}" if self.user_id else f"session={self.session_key}"
        return f"ProductView(product={self.product_id}, {who} @ {self.viewed_at.isoformat()})"


class SearchLog(models.Model):
    """One row per search query (Module 11 spec §11.1).

    Captured by :mod:`apps.recommendations.services.SearchLogService`
    either inline (fast paths) or via Celery. Used by analytics to
    monitor high-traffic queries, zero-result queries, and per-vendor
    search interest.

    * ``user`` is null for anonymous searches.
    * ``results_count`` is recorded at log time, not derived later.
    * ``timestamp`` is the wall-clock time of the request -- this is a
      raw event log, not a TimeStampedModel.
    """

    id = models.BigAutoField(primary_key=True)
    query = models.CharField(
        max_length=255,
        db_index=True,
        help_text="The exact search string (post-trim, pre-lowercasing for storage).",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="search_logs",
        help_text="Null for anonymous searches.",
    )
    results_count = models.IntegerField(
        default=0,
        help_text="Number of products that matched at log time.",
    )
    timestamp = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="When the query was made.",
    )

    class Meta:
        verbose_name = "Search log"
        verbose_name_plural = "Search logs"
        ordering = ("-timestamp",)
        indexes = [
            # Trending-queries report.
            models.Index(fields=("query", "-timestamp")),
            # Per-user search history (admin audit + auth debugging).
            models.Index(fields=("user", "-timestamp")),
            # Zero-result monitoring.
            models.Index(fields=("results_count", "-timestamp")),
        ]

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        who = f"user={self.user_id}" if self.user_id else "anon"
        return f"SearchLog<{self.query!r} {self.results_count}h {who} @ {self.timestamp.isoformat()}>"
