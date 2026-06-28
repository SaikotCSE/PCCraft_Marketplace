"""Tests for the reviews app -- Module 6.

These tests use Django's ``TestCase`` directly (rather than
``pytest-django``) because the project hasn't yet standardised on a
test runner.  Coverage targets the spec's audit checklist items:
hard-gate, duplicate prevention, race-free counters, vendor-only
permission, admin moderation, soft-cache invalidation.
"""
from __future__ import annotations

import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import BusinessType, UserRole, VendorProfile, VendorStatus
from apps.brands.models import Brand
from apps.categories.models import Category
from apps.orders.models import Order, OrderItem, OrderItemStatus, OrderStatus, PaymentStatus
from apps.products.models import Product, ProductStatus
from apps.reviews.models import Review, ReviewHelpful, ReviewImage
from apps.reviews.services import ReviewService, ReviewServiceError

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _png_bytes(width: int = 10, height: int = 10) -> bytes:
    """Return a tiny in-memory PNG for use as an upload."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(255, 0, 0)).save(buf, "PNG")
    return buf.getvalue()


def _image(name: str = "r.png") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, _png_bytes(), content_type="image/png")


def _make_user(email: str = "u1@example.com", *, role: str = UserRole.CUSTOMER) -> User:
    return User.objects.create_user(
        email=email,
        username=email.split("@")[0],
        password="password123",
        full_name="User " + email.split("@")[0],
        role=role,
    )


def _make_vendor_user(email: str = "v1@example.com") -> User:
    user = User.objects.create_user(
        email=email,
        username=email.split("@")[0],
        password="password123",
        full_name="Vendor One",
        role=UserRole.VENDOR,
    )
    VendorProfile.objects.create(
        user=user,
        store_name="Store One",
        store_slug="store-one",
        business_type=BusinessType.SOLE_PROP,
        status=VendorStatus.APPROVED,
        is_approved=True,
    )
    return user


def _make_category(slug: str = "cat-1") -> Category:
    return Category.objects.create(
        name=slug.title(), slug=slug, is_active=True,
    )


def _make_brand(slug: str = "brand-1") -> Brand:
    return Brand.objects.create(name=slug.title(), slug=slug, is_active=True)


def _make_product(vendor_user: User, slug: str = "prod-1") -> Product:
    return Product.objects.create(
        name="Product 1",
        slug=slug,
        brand=_make_brand(),
        category=_make_category(),
        vendor=vendor_user.vendor_profile,
        base_price="100.00",
        stock_quantity=10,
        status=ProductStatus.ACTIVE,
    )


def _make_delivered_order(customer: User, product: Product) -> OrderItem:
    """Helper: produce an Order + OrderItem in DELIVERED state."""
    order = Order.objects.create(
        customer=customer,
        order_number="ORD-REV-1",
        status=OrderStatus.DELIVERED,
        payment_status=PaymentStatus.PAID,
        subtotal="100.00",
        total="100.00",
        shipping_full_name="Test",
        shipping_phone="01700000000",
        shipping_address_line1="Street 1",
        shipping_city="Dhaka",
        shipping_postal_code="1207",
    )
    return OrderItem.objects.create(
        order=order,
        product=product,
        product_name=product.name,
        quantity=1,
        unit_price="100.00",
        line_total="100.00",
        item_status=OrderItemStatus.DELIVERED,
    )


# ===========================================================================
# Service-layer unit tests
# ===========================================================================
class ReviewServiceTest(TestCase):
    """Exercise the business rules directly -- no HTTP layer."""

    def setUp(self) -> None:
        self.vendor_user = _make_vendor_user()
        self.product = _make_product(self.vendor_user)
        self.customer = _make_user("buyer@example.com")

    # ------------------------------------------------------------------
    # can_review -- hard gate
    # ------------------------------------------------------------------
    def test_can_review_requires_delivered_item(self):
        ok, reason = ReviewService.can_review(self.customer, self.product)
        self.assertFalse(ok)
        self.assertIn("purchased", (reason or "").lower())

    def test_can_review_passes_for_delivered_customer(self):
        _make_delivered_order(self.customer, self.product)
        ok, reason = ReviewService.can_review(self.customer, self.product)
        self.assertTrue(ok, msg=reason)
        self.assertIsNone(reason)

    def test_can_review_blocks_unauthenticated(self):
        ok, reason = ReviewService.can_review(None, self.product)
        self.assertFalse(ok)
        self.assertIn("auth", (reason or "").lower())

    # ------------------------------------------------------------------
    # create_review -- happy path + duplicate prevention
    # ------------------------------------------------------------------
    def test_create_review_sets_verified_purchase(self):
        _make_delivered_order(self.customer, self.product)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Excellent product indeed."},
        )
        self.assertTrue(review.is_verified_purchase)
        self.assertEqual(review.user_id, self.customer.pk)
        self.assertEqual(review.rating, 5)

    def test_create_review_then_duplicate_returns_409(self):
        _make_delivered_order(self.customer, self.product)
        ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 4, "title": "OK", "body": "Body text here."},
        )
        with self.assertRaises(ReviewServiceError) as ctx:
            ReviewService.create_review(
                user=self.customer,
                product=self.product,
                data={"rating": 2, "title": "Again", "body": "Different body."},
            )
        self.assertEqual(ctx.exception.code, "duplicate_review")
        self.assertEqual(ctx.exception.status, 409)

    def test_create_review_invalid_rating_rejected(self):
        with self.assertRaises(ReviewServiceError) as ctx:
            ReviewService.create_review(
                user=self.customer,
                product=self.product,
                data={"rating": 7, "title": "Bad", "body": "Body text here."},
            )
        self.assertEqual(ctx.exception.code, "validation_error")

    # ------------------------------------------------------------------
    # toggle_helpful -- race-free
    # ------------------------------------------------------------------
    def test_helpful_toggle_round_trip(self):
        _make_delivered_order(self.customer, self.product)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Good", "body": "Solid product."},
        )
        # First voter
        other = _make_user("other@example.com")
        first = ReviewService.toggle_helpful(user=other, review_id=review.pk)
        self.assertTrue(first["helpful"])
        self.assertEqual(first["count"], 1)

        # Second voter
        third = _make_user("third@example.com")
        second = ReviewService.toggle_helpful(user=third, review_id=review.pk)
        self.assertTrue(second["helpful"])
        self.assertEqual(second["count"], 2)

        # First voter un-votes
        third_round = ReviewService.toggle_helpful(user=other, review_id=review.pk)
        self.assertFalse(third_round["helpful"])
        self.assertEqual(third_round["count"], 1)

    def test_helpful_unique_constraint_blocks_double_vote(self):
        _make_delivered_order(self.customer, self.product)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Good", "body": "Solid product."},
        )
        voter = _make_user("voter@example.com")
        ReviewService.toggle_helpful(user=voter, review_id=review.pk)
        # Forging a second vote via ORM must raise IntegrityError.
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ReviewHelpful.objects.create(review=review, user=voter)
        # The successful toggle above is still the only one -- 1 vote total.
        self.assertEqual(ReviewHelpful.objects.filter(review=review).count(), 1)

    # ------------------------------------------------------------------
    # vendor reply
    # ------------------------------------------------------------------
    def test_vendor_can_reply_only_to_own_products(self):
        _make_delivered_order(self.customer, self.product)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 4, "title": "Ok", "body": "Body text here."},
        )
        vendor_profile = self.vendor_user.vendor_profile
        # First reply succeeds.
        review = ReviewService.add_vendor_reply(
            vendor=vendor_profile,
            review_id=review.pk,
            reply_text="Thanks for your feedback, customer!",
        )
        self.assertTrue(review.vendor_reply)
        self.assertIsNotNone(review.vendor_replied_at)

        # Editing the reply sets vendor_reply_edited_at.
        review = ReviewService.add_vendor_reply(
            vendor=vendor_profile,
            review_id=review.pk,
            reply_text="Updated reply with more text here.",
        )
        self.assertIsNotNone(review.vendor_reply_edited_at)

        # A *different* vendor cannot reply.
        other_vendor = _make_vendor_user("vendor2@example.com")
        with self.assertRaises(ReviewServiceError) as ctx:
            ReviewService.add_vendor_reply(
                vendor=other_vendor.vendor_profile,
                review_id=review.pk,
                reply_text="This is another vendor reply",
            )
        self.assertEqual(ctx.exception.code, "forbidden")

    def test_vendor_reply_min_length_enforced(self):
        _make_delivered_order(self.customer, self.product)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 4, "title": "Ok", "body": "Body text here."},
        )
        with self.assertRaises(ReviewServiceError) as ctx:
            ReviewService.add_vendor_reply(
                vendor=self.vendor_user.vendor_profile,
                review_id=review.pk,
                reply_text="short",
            )
        self.assertEqual(ctx.exception.code, "validation_error")

    # ------------------------------------------------------------------
    # image cap
    # ------------------------------------------------------------------
    def test_image_cap_is_4(self):
        _make_delivered_order(self.customer, self.product)
        images = [_image("a.png"), _image("b.png"), _image("c.png"), _image("d.png"), _image("e.png")]
        with self.assertRaises(ReviewServiceError) as ctx:
            ReviewService.create_review(
                user=self.customer,
                product=self.product,
                data={"rating": 5, "title": "Great", "body": "Great product here."},
                images=images,
            )
        self.assertEqual(ctx.exception.code, "too_many_images")

    # ------------------------------------------------------------------
    # admin moderation
    # ------------------------------------------------------------------
    def test_hide_review_excludes_from_public_listing(self):
        _make_delivered_order(self.customer, self.product)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Great product here."},
        )
        ReviewService.hide_review(review_id=review.pk)
        review.refresh_from_db()
        self.assertTrue(review.is_hidden)
        # Hide should also drop the product's denormalised review_count to 0.
        self.product.refresh_from_db()
        self.assertEqual(self.product.review_count, 0)

    def test_restore_brings_back_into_listing(self):
        _make_delivered_order(self.customer, self.product)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Great product here."},
        )
        ReviewService.hide_review(review_id=review.pk)
        ReviewService.restore_review(review_id=review.pk)
        review.refresh_from_db()
        self.assertFalse(review.is_hidden)

    # ------------------------------------------------------------------
    # rating immutability
    # ------------------------------------------------------------------
    def test_rating_immutable_after_create(self):
        _make_delivered_order(self.customer, self.product)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Great product here."},
        )
        with self.assertRaises(ReviewServiceError) as ctx:
            ReviewService.update_review(
                user=self.customer,
                review=review,
                data={"rating": 1, "title": "Changed", "body": "Now I hate it."},
            )
        self.assertEqual(ctx.exception.code, "rating_immutable")


# ===========================================================================
# API tests
# ===========================================================================
class ReviewAPITest(TestCase):
    """End-to-end tests through the HTTP layer."""

    def setUp(self) -> None:
        self.vendor_user = _make_vendor_user()
        self.product = _make_product(self.vendor_user)
        self.customer = _make_user("buyer@example.com")
        _make_delivered_order(self.customer, self.product)
        self.client = APIClient()

    def _auth(self, user: User) -> None:
        self.client.force_authenticate(user=user)

    # ---- public list + can-review ------------------------------------
    def test_public_list_anonymous(self):
        ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
        )
        resp = self.client.get(
            "/api/v1/products/%s/reviews/" % self.product.slug
        )
        self.assertEqual(resp.status_code, 200)

    def test_can_review_returns_true(self):
        self._auth(self.customer)
        resp = self.client.get(
            "/api/v1/products/%s/can-review/" % self.product.slug
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["data"]["can_review"])

    def test_rating_breakdown(self):
        self._auth(self.customer)
        ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
        )
        resp = self.client.get(
            "/api/v1/products/%s/rating-breakdown/" % self.product.slug
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["data"]["total"], 1)
        self.assertEqual(body["data"]["breakdown"]["5"], 1)

    # ---- author CRUD -------------------------------------------------
    def test_create_review_requires_auth(self):
        resp = self.client.post(
            "/api/v1/products/%s/reviews/" % self.product.slug,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
            format="json",
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_create_review_409_on_duplicate(self):
        self._auth(self.customer)
        first = self.client.post(
            "/api/v1/products/%s/reviews/" % self.product.slug,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        dup = self.client.post(
            "/api/v1/products/%s/reviews/" % self.product.slug,
            data={"rating": 2, "title": "Again", "body": "Another body."},
            format="json",
        )
        self.assertEqual(dup.status_code, 409)

    def test_patch_requires_owner(self):
        self._auth(self.customer)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
        )
        other = _make_user("other@example.com")
        self._auth(other)
        resp = self.client.patch(
            "/api/v1/reviews/%s/" % review.pk,
            data={"title": "Hijack"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    # ---- helpful toggle ---------------------------------------------
    def test_helpful_toggle_endpoint(self):
        self._auth(self.customer)
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
        )
        voter = _make_user("voter@example.com")
        self._auth(voter)
        resp = self.client.post("/api/v1/reviews/%s/helpful/" % review.pk)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["data"]["helpful"])
        self.assertEqual(resp.json()["data"]["count"], 1)

    # ---- vendor endpoints -------------------------------------------
    def test_vendor_can_reply(self):
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
        )
        self._auth(self.vendor_user)
        resp = self.client.post(
            "/api/v1/vendor/reviews/%s/reply/" % review.pk,
            data={"reply_text": "Thanks for your feedback!"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        review.refresh_from_db()
        self.assertIn("Thanks", review.vendor_reply)

    def test_other_vendor_cannot_reply(self):
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
        )
        other_vendor = _make_vendor_user("v2@example.com")
        self._auth(other_vendor)
        resp = self.client.post(
            "/api/v1/vendor/reviews/%s/reply/" % review.pk,
            data={"reply_text": "This is another vendor reply."},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    # ---- admin endpoints --------------------------------------------
    def test_admin_can_hide(self):
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
        )
        admin = User.objects.create_user(
            email="admin@example.com",
            username="admin",
            password="password123",
            full_name="Admin",
            role=UserRole.ADMIN,
            is_staff=True,
        )
        self._auth(admin)
        resp = self.client.post(
            "/api/v1/admin/reviews/%s/hide/" % review.pk
        )
        self.assertEqual(resp.status_code, 200)
        review.refresh_from_db()
        self.assertTrue(review.is_hidden)

    def test_non_admin_cannot_hide(self):
        review = ReviewService.create_review(
            user=self.customer,
            product=self.product,
            data={"rating": 5, "title": "Great", "body": "Body text here."},
        )
        self._auth(self.customer)
        resp = self.client.post(
            "/api/v1/admin/reviews/%s/hide/" % review.pk
        )
        self.assertEqual(resp.status_code, 403)
