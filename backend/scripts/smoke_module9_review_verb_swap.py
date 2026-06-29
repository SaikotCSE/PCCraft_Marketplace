"""Smoke test for the review moderation verb swap (POST → PATCH).

Covers:
    POST  /api/v1/admin/reviews/{id}/hide/    → 405
    PATCH /api/v1/admin/reviews/{id}/hide/    → 200
    POST  /api/v1/admin/reviews/{id}/restore/ → 405
    PATCH /api/v1/admin/reviews/{id}/restore/ → 200

Picks the first seeded review, flips its visibility, and restores state
in `finally` so seeded data is not mutated.
"""
from __future__ import annotations

import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.reviews.models import Review

User = get_user_model()

ADMIN_EMAIL = os.environ.get("SMOKE_ADMIN_EMAIL", "admin@pccraft.com")

# Allow the APIClient's default `testserver` host.
if "testserver" not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ["testserver"]


def main() -> int:
    user = User.objects.filter(email=ADMIN_EMAIL, is_staff=True, is_superuser=True).first()
    if user is None:
        raise SystemExit(f"admin user {ADMIN_EMAIL!r} not found / not superuser")

    review = Review.objects.filter(is_active=True).first()
    if review is None:
        raise SystemExit("no seeded review available")
    original_hidden = review.is_hidden
    print(f"[smoke] admin={user.email} review_id={review.pk} start_hidden={original_hidden}")

    client = APIClient()
    client.force_authenticate(user=user)
    failures: list[str] = []

    def check(label: str, response, expected: int) -> None:
        ok = response.status_code == expected
        marker = "OK " if ok else "FAIL"
        print(f"  [{marker}] {label}: got {response.status_code}, expected {expected}")
        if not ok:
            failures.append(f"{label}: {response.status_code}")
            try:
                print(f"          body: {response.json()}")
            except Exception:
                pass

    try:
        # 1. POST hide → 405 (was the old behaviour)
        r = client.post(f"/api/v1/admin/reviews/{review.pk}/hide/", {}, format="json")
        check("POST hide (should be 405)", r, 405)

        # 2. PATCH hide → 200 (new spec surface)
        r = client.patch(f"/api/v1/admin/reviews/{review.pk}/hide/", {}, format="json")
        check("PATCH hide (should be 200)", r, 200)
        review.refresh_from_db()
        if not review.is_hidden:
            failures.append(f"hide did not flip is_hidden (got {review.is_hidden})")
            print(f"  [FAIL] is_hidden after PATCH hide: {review.is_hidden}")

        # 3. POST restore → 405
        r = client.post(f"/api/v1/admin/reviews/{review.pk}/restore/", {}, format="json")
        check("POST restore (should be 405)", r, 405)

        # 4. PATCH restore → 200
        r = client.patch(f"/api/v1/admin/reviews/{review.pk}/restore/", {}, format="json")
        check("PATCH restore (should be 200)", r, 200)
        review.refresh_from_db()
        if review.is_hidden:
            failures.append(f"restore did not flip is_hidden (got {review.is_hidden})")
            print(f"  [FAIL] is_hidden after PATCH restore: {review.is_hidden}")

        # 5. Bogus id → 404 on PATCH
        r = client.patch(
            "/api/v1/admin/reviews/00000000-0000-0000-0000-000000000000/hide/",
            {},
            format="json",
        )
        check("PATCH hide on bogus id (404)", r, 404)
    finally:
        Review.objects.filter(pk=review.pk).update(is_hidden=original_hidden)
        print(f"[smoke] restored review {review.pk} is_hidden={original_hidden}")

    if failures:
        print(f"\n[smoke] FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\n[smoke] PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())