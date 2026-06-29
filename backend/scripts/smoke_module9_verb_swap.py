"""Module 9 verb-swap smoke (build-order step 4).

Confirms the admin user/vendor moderation endpoints respond to PATCH
(spec line 3153-3163) and now return 405 for the old POST verbs.

For the user endpoints (suspend/activate/unlock) we exercise the route
without actually flipping state on a real account — we hit it with a
bogus user_id and assert the *error* envelope (typed 404) is what the
PATCH handler produces, while POST returns 405. That validates the
verb is wired correctly without needing a fixture user we can mutate.

For the vendor endpoints, we promote a real PENDING vendor → APPROVED
(irreversible-ish), so we snapshot the row first and restore it after.

Run from backend/:
    /home/wang-lin/miniforge3/envs/pccraft/bin/python scripts/smoke_module9_verb_swap.py
"""
from __future__ import annotations

import os
import sys

import django

BACKEND = "/home/wang-lin/Saikot/PCCraft_Marketplace/backend"
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.conf import settings  # noqa: E402
from django.test import Client  # noqa: E402
from rest_framework_simplejwt.tokens import RefreshToken  # noqa: E402

from apps.accounts.models import CustomUser, VendorProfile  # noqa: E402
from apps.accounts.services import VendorStatus  # noqa: E402

if "testserver" not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ["testserver"]

client = Client()


def _banner(label: str) -> None:
    print(f"\n=== {label} ===")


def _admin_token() -> tuple[str, CustomUser]:
    admin = CustomUser.objects.filter(role="admin", is_active=True).first()
    if admin is None:
        raise SystemExit("No active admin user in DB — cannot smoke test.")
    access = str(RefreshToken.for_user(admin).access_token)
    return access, admin


def _hdrs(token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def main() -> int:
    token, admin = _admin_token()
    print(f"Authenticated as admin: {admin.email}")
    headers = _hdrs(token)

    # ----- 1. User moderation: verify POST → 405, PATCH → real handler -----
    _banner("User routes — POST should now be 405, PATCH should dispatch")
    bogus_uuid = "00000000-0000-0000-0000-000000000000"

    for action in ("suspend", "activate", "unlock"):
        path = f"/api/v1/admin/users/{bogus_uuid}/{action}/"
        # Old verb must be rejected by DRF.
        r_old = client.post(path, **{**headers, "content_type": "application/json"}, data={})
        # New verb must reach the handler (will return 404 since the UUID is bogus).
        r_new = client.patch(path, **{**headers, "content_type": "application/json"}, data={})
        print(f"  {action:<8} POST -> {r_old.status_code} | PATCH -> {r_new.status_code}")
        assert r_old.status_code == 405, (
            f"POST {path} should now be 405, got {r_old.status_code}"
        )
        assert r_new.status_code == 404, (
            f"PATCH {path} should reach handler and return 404, got {r_new.status_code}"
        )

    # ----- 2. User delete: spec says DELETE — must still work -----
    _banner("User DELETE route — still DELETE (no change)")
    path = f"/api/v1/admin/users/{bogus_uuid}/"
    r_del = client.delete(path, **headers)
    print(f"  DELETE {path} -> {r_del.status_code}")
    assert r_del.status_code == 404, (
        f"DELETE {path} should reach handler and return 404, got {r_del.status_code}"
    )

    # ----- 3. Vendor routes: same verb-swap check on a real PENDING vendor -----
    _banner("Vendor routes — POST should be 405, PATCH should dispatch")

    # Find a PENDING vendor to exercise approve/reject/request-info.
    pending = (
        VendorProfile.objects.filter(status=VendorStatus.PENDING)
        .order_by("id")
        .first()
    )
    if pending is None:
        raise SystemExit("No PENDING vendor in DB — cannot exercise vendor verbs.")
    vendor_id = pending.id
    original_status = pending.status
    print(f"  using vendor id={vendor_id} (status={original_status})")

    # Approve: snapshot status, run PATCH, then restore via the model.
    try:
        r_post = client.post(
            f"/api/v1/admin/vendors/{vendor_id}/approve/",
            **{**headers, "content_type": "application/json"},
            data={},
        )
        r_patch = client.patch(
            f"/api/v1/admin/vendors/{vendor_id}/approve/",
            **{**headers, "content_type": "application/json"},
            data={},
        )
        print(f"  approve POST  -> {r_post.status_code}")
        print(f"  approve PATCH -> {r_patch.status_code}")
        assert r_post.status_code == 405, "POST approve should be 405"
        assert r_patch.status_code == 200, f"PATCH approve should succeed, got {r_patch.status_code}"

        # Confirm the side-effect happened.
        pending.refresh_from_db()
        assert pending.status == VendorStatus.APPROVED, (
            f"vendor should be APPROVED after PATCH, got {pending.status}"
        )
        print(f"  side-effect: vendor {vendor_id} status is now {pending.status}")

        # Reject + request-info: need a vendor still in PENDING. Flip it back briefly
        # to test those two handlers, then restore.
        pending.status = VendorStatus.PENDING
        pending.save(update_fields=["status"])

        for action, body in (
            ("reject", {"reason": "smoke test reject"}),
            ("request-info", {"message": "smoke test info request"}),
        ):
            path = f"/api/v1/admin/vendors/{vendor_id}/{action}/"
            r_post = client.post(
                path, **{**headers, "content_type": "application/json"}, data=body
            )
            r_patch = client.patch(
                path, **{**headers, "content_type": "application/json"}, data=body
            )
            print(f"  {action:<13} POST -> {r_post.status_code} | PATCH -> {r_patch.status_code}")
            assert r_post.status_code == 405, f"POST {action} should be 405"
            assert r_patch.status_code == 200, (
                f"PATCH {action} should succeed, got {r_patch.status_code}"
            )

            # Restore PENDING between the two so each handler sees the right starting state.
            pending.refresh_from_db()
            pending.status = VendorStatus.PENDING
            pending.save(update_fields=["status"])

    finally:
        # Always restore the original state — never leave the seed mutated.
        pending.refresh_from_db()
        pending.status = original_status
        pending.save(update_fields=["status"])
        print(f"  restored vendor {vendor_id} to status={original_status}")

    print("\nALL VERB-SWAP SMOKE CHECKS PASSED ✔")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())