"""Review models -- Module 6 (per spec section ``MODULE 6 -- Reviews & Ratings``).

Three concrete models:

* ``Review``           -- one row per (customer, product).  Hard-gated by
  ``OrderItem.item_status='DELIVERED'`` via ``ReviewService.can_review``.
  Carries rating + title + body, vendor reply fields, and admin moderation
  flags (``is_hidden``).

* ``ReviewImage``      -- up to 4 attached images per review (enforced in
  ``ReviewService.create_review``).  Cascade-deleted with the parent.

* ``ReviewHelpful``    -- one row per (review, user) "this was helpful"
  vote.  Composite unique constraint prevents double-votes.  Helpful
  counter on the parent row is incremented/decremented via F() inside a
  ``select_for_update`` transaction (see ``ReviewService.toggle_helpful``).

The Product's denormalised ``average_rating`` and ``review_count``
columns are recomputed by the service layer on every review
create/delete/hide/restore so the catalog page never serves a stale
average.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.common.models import TimeStampedModel
from apps.products.models import Product


def _review_image_path(instance: "ReviewImage", filename: str) -> str:
    """Upload-to path: ``reviews/images/YYYY/MM/<uuid>-<safe-filename>``."""
    return "reviews/images/%s/%s/%s" % (
        instance.created_at.year if instance.created_at else "0000",
        instance.created_at.month if instance.created_at else "00",
        filename,
    )


class Review(TimeStampedModel):
    """A customer's review of a single product.

    One row per (product, user) -- the ``UniqueConstraint`` in ``Meta``
    enforces this at the DB level.  ``ReviewService.create_review``
    surfaces a ``duplicate_review`` error when violated so the API can
    return 409.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="reviews",
        related_query_name="review",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reviews",
        related_query_name="review",
    )

    # -- core content -----------------------------------------------------
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="1..5 stars. Immutable after creation.",
    )
    title = models.CharField(max_length=200)
    # Note: spec says ``body`` (not ``comment``). Min/max are enforced in
    # ``ReviewCreateSerializer`` so the DB column stays a plain TextField.
    body = models.TextField()

    # -- provenance / trust ----------------------------------------------
    # Set by the service from the OrderItem history. NEVER user-submitted
    # so the value can't be forged through the API.
    is_verified_purchase = models.BooleanField(default=False)

    # -- counters / moderation -------------------------------------------
    helpful_count = models.PositiveIntegerField(default=0, db_index=True)
    is_hidden = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Admin moderation flag. Hidden reviews are excluded from public listings and product averages.",
    )

    # -- vendor reply ----------------------------------------------------
    vendor_reply = models.TextField(blank=True, default="")
    vendor_replied_at = models.DateTimeField(null=True, blank=True)
    vendor_reply_edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Review"
        verbose_name_plural = "Reviews"
        ordering = ("-created_at",)
        indexes = [
            # Newest-first listing
            models.Index(fields=("product", "-created_at")),
            # Most-helpful-first sort
            models.Index(fields=("product", "-helpful_count")),
            # Rating-filter (1★..5★)
            models.Index(fields=("product", "rating")),
            # Admin moderation queues
            models.Index(fields=("is_hidden", "-created_at")),
            # Customer's own reviews
            models.Index(fields=("user", "-created_at")),
        ]
        constraints = [
            # One review per (product, user) -- the spec's hard duplicate guard.
            models.UniqueConstraint(
                fields=("product", "user"),
                name="uniq_review_per_product_user",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        return "Review<%s -> %s : %d★>" % (
            getattr(self.user, "email", self.user_id),
            getattr(self.product, "slug", self.product_id),
            self.rating,
        )


class ReviewImage(TimeStampedModel):
    """An image attached to a review.  Up to 4 per review (enforced in service)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    review = models.ForeignKey(
        Review,
        on_delete=models.CASCADE,
        related_name="images",
        related_query_name="image",
    )
    image = models.ImageField(upload_to=_review_image_path)

    class Meta:
        verbose_name = "Review image"
        verbose_name_plural = "Review images"
        ordering = ("created_at",)

    def __str__(self) -> str:  # pragma: no cover
        return "ReviewImage<%s>" % self.pk


class ReviewHelpful(TimeStampedModel):
    """A (review, user) "this was helpful" vote.  Unique together."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    review = models.ForeignKey(
        Review,
        on_delete=models.CASCADE,
        related_name="helpful_votes",
        related_query_name="helpful_vote",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="review_helpful_votes",
        related_query_name="review_helpful_vote",
    )

    class Meta:
        verbose_name = "Review helpful vote"
        verbose_name_plural = "Review helpful votes"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("review", "user"),
                name="uniq_review_helpful_per_user",
            ),
        ]
        indexes = [
            models.Index(fields=("review",)),
            models.Index(fields=("user", "-created_at")),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return "ReviewHelpful<review=%s user=%s>" % (self.review_id, self.user_id)
