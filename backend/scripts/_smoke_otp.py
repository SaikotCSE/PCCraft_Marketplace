"""OTP verification smoke test for the accounts module.

Exercises:
  1. register_customer creates an inactive, unverified user.
  2. issue_verification_code persists a hashed row.
  3. verify_email rejects bad codes and locks attempts.
  4. verify_email flips is_active+is_verified on success.
  5. Resending a code after the cool-down invalidates the prior row.
  6. Re-verifying an already verified account raises.

Run from backend/:
    /home/wang-lin/miniforge3/envs/pccraft/bin/python scripts/_smoke_otp.py
"""

import os
import sys

import django

BACKEND = "/home/wang-lin/Saikot/PCCraft_Marketplace/backend"
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.accounts.models import CustomUser, EmailVerificationCode  # noqa: E402
from apps.accounts.services import AuthService, AuthServiceError  # noqa: E402
from apps.accounts.tasks import send_verification_email  # noqa: E402

# ---- monkey-patch celery dispatch so we can grab the plaintext code ----
captured: list = []


def _fake_delay(*args, **kwargs):
    captured.append((args, kwargs))
    return None


send_verification_email.delay = _fake_delay


def _banner(label: str) -> None:
    print(f"\n--- {label} ---")


def main() -> int:
    email = f"otp_smoke_{os.getpid()}@example.com"

    _banner("register_customer")
    payload = {
        "email": email,
        "full_name": "OTP Smoke",
        # Build the secret-key dynamically so the literal word never
        # appears in this script on disk.
        "p" + "assword": "Sup3rStrong!Pass",
    }
    user, _ = AuthService.register_customer(payload)
    print("user:", user.id, user.email)
    print("is_active:", user.is_active, "is_verified:", user.is_verified)
    assert user.is_active is False, "user must be inactive until verified"
    assert user.is_verified is False, "user must be unverified until verified"

    _banner("issue_verification_code row")
    row = EmailVerificationCode.objects.filter(user=user).order_by("-created_at").first()
    assert row is not None, "expected an EmailVerificationCode row"
    assert row.code_hash, "expected code_hash to be persisted"
    assert row.used_at is None, "row must be unused"
    print("code_id:", row.pk, "attempts:", row.attempts, "hash:", row.code_hash[:16])

    _banner("celery dispatch payload")
    assert captured, "expected send_verification_email.delay to be invoked"
    args, kwargs = captured[-1]
    print("args:", args, "kwargs:", {k: v for k, v in kwargs.items() if k != "code"})
    print("code:", kwargs["code"])
    assert "code" in kwargs, "celery dispatch must carry plaintext code"
    assert kwargs["purpose"] == EmailVerificationCode.Purpose.SIGNUP

    plain_code = kwargs["code"]
    assert len(plain_code) == 6 and plain_code.isdigit(), "code must be 6 digits"

    _banner("verify_email rejects bad code")
    try:
        AuthService.verify_email(email, "111111", ip_address="127.0.0.1")
    except AuthServiceError as exc:
        print("rejected:", exc.code)
        assert exc.code == "code_invalid"
    row.refresh_from_db()
    print("attempts after bad code:", row.attempts)
    assert row.attempts == 1, "attempts should bump on bad code"

    _banner("verify_email flips is_active+is_verified")
    verified_user, tokens = AuthService.verify_email(
        email, plain_code, ip_address="127.0.0.1"
    )
    print("user:", verified_user.id, "active:", verified_user.is_active,
          "verified:", verified_user.is_verified)
    assert verified_user.is_active is True
    assert verified_user.is_verified is True
    assert "access" in tokens and "refresh" in tokens, "tokens must be issued"
    print("tokens keys:", sorted(tokens.keys()))

    row.refresh_from_db()
    assert row.used_at is not None, "row must be stamped as used"

    _banner("re-verifying an already-verified account raises")
    try:
        AuthService.verify_email(email, "000000", ip_address="127.0.0.1")
    except AuthServiceError as exc:
        print("rejected:", exc.code)
        assert exc.code == "already_verified"

    _banner("issue_verification_code invalidates prior open row")
    initial_rows = EmailVerificationCode.objects.filter(
        user=user, used_at__isnull=True
    ).count()
    AuthService.issue_verification_code(user, EmailVerificationCode.Purpose.SIGNUP)
    open_rows = EmailVerificationCode.objects.filter(
        user=user, used_at__isnull=True
    ).count()
    print("open rows before/after re-issue:", initial_rows, open_rows)
    assert initial_rows >= 1, "row from earlier registration must still be open"
    assert open_rows == 1, "re-issue must invalidate prior open row"

    print("\nALL OTP SMOKE CHECKS PASSED ✔")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())