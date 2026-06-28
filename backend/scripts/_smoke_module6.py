"""Module 6 smoke test -- non-destructive, runs against the dev DB."""
import os
import sys

# Ensure ``config.*`` is importable when this script is invoked
# directly from anywhere (conda run resets cwd).
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from apps.accounts.models import CustomUser, UserRole
from apps.products.models import Product
from apps.reviews.services import ReviewService
from apps.reviews.serializers import (
    ReviewCreateSerializer,
    ReviewUpdateSerializer,
    VendorReplySerializer,
    ReviewModerationSerializer,
    CanReviewResponseSerializer,
)

print("--- PRODUCT.avg_rating ---")
prod = Product.objects.filter(is_active=True).first()
print("product:", prod and prod.slug, "avg_rating:", prod and prod.avg_rating)

print("--- can_review (no delivered order) ---")
cust, _ = CustomUser.objects.get_or_create(
    email="smoke-customer@example.com",
    defaults={"full_name": "Smoke Customer", "role": UserRole.CUSTOMER},
)
ok, reason = ReviewService.can_review(cust, prod)
print("can_review(no_order):", ok, "reason:", reason)

print("--- ReviewCreateSerializer validation ---")
s = ReviewCreateSerializer(data={"rating": 5, "title": "Great", "body": "x" * 5})
print("short body valid?  ->", s.is_valid(), s.errors)
s = ReviewCreateSerializer(data={"rating": 5, "title": "Great", "body": "x" * 31})
print("ok body valid?    ->", s.is_valid(), s.errors)
s = ReviewCreateSerializer(data={"rating": 6, "title": "Great", "body": "x" * 31})
print("rating 6 valid?   ->", s.is_valid(), s.errors)

print("--- ReviewUpdateSerializer validation ---")
s = ReviewUpdateSerializer(data={"title": "Updated", "body": "y" * 31})
print("update valid?     ->", s.is_valid(), s.errors)

print("--- VendorReplySerializer validation ---")
s = VendorReplySerializer(data={"reply_text": "x" * 9})
print("short reply valid? ->", s.is_valid(), s.errors)
s = VendorReplySerializer(data={"reply_text": "x" * 100})
print("ok reply valid?    ->", s.is_valid(), s.errors)

print("--- ReviewModerationSerializer validation ---")
s = ReviewModerationSerializer(data={"is_hidden": True})
print("moderate valid?   ->", s.is_valid(), s.errors)

print("--- CanReviewResponseSerializer ---")
s = CanReviewResponseSerializer(data={"can_review": False, "reason": "Nope"})
print("can_review resp   ->", s.is_valid(), s.errors)

print("--- URL reverse checks ---")
from django.urls import reverse
import uuid

slug = prod.slug if prod else "test-test-gpu"
sample_uuid = str(uuid.uuid4())
print("slug:", slug)

# Each tuple: (reverse-name, kwargs)
url_checks = [
    ("api:products-reviews:product-reviews-list", {"slug": slug}),
    ("api:products-reviews:product-can-review", {"slug": slug}),
    ("api:products-reviews:product-rating-breakdown", {"slug": slug}),
    ("api:reviews:review-detail", {"pk": sample_uuid}),
    ("api:reviews:review-helpful", {"pk": sample_uuid}),
    ("api:reviews:review-can-review", None),
    ("api:vendor-reviews:vendor-reviews-list", None),
    ("api:vendor-reviews:vendor-review-reply", {"pk": sample_uuid}),
    ("api:admin-reviews:admin-reviews-list", None),
    ("api:admin-reviews:admin-reviews-detail", {"pk": sample_uuid}),
    ("api:admin-reviews:admin-reviews-moderate", {"pk": sample_uuid}),
    ("api:admin-reviews:admin-reviews-remove-reply", {"pk": sample_uuid}),
]
for name, kwargs in url_checks:
    try:
        url = reverse(name, kwargs=kwargs) if kwargs else reverse(name)
        print(f"{name} -> {url}")
    except Exception as e:
        print(f"{name} ERROR: {e}")

print("--- DONE ---")
