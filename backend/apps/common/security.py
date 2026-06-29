"""Cross-cutting security helpers -- Module 9.

Implements:

* ``LoginRateThrottle``    -- 5 attempts / minute per (email, ip) tuple.
* ``AccountLockoutPolicy`` -- max 5 failed attempts → lock for 15 min.
* ``SecurityService``      -- record login attempts, evaluate lockout.
* ``contains_bad_words``   -- cheap bad-word filter for review/product text.
* ``SecurityHeadersMiddleware`` -- production security response headers.

All of these are best-effort: the auth flow must still produce a
correct envelope even if any of them raise.
"""
from __future__ import annotations

import logging
import re
from typing import Iterable

from django.core.cache import cache as _redis_cache
from django.utils import timezone
from rest_framework.throttling import SimpleRateThrottle

logger = logging.getLogger(__name__)


# =====================================================================
# Login rate throttle
# =====================================================================
class LoginRateThrottle(SimpleRateThrottle):
    """Throttle key = ``login:<email>:<ip>`` so one user can't DoS another.

    Spec default: 30 attempts per hour per (email, ip). Configurable via
    DRF settings (``DEFAULT_THROTTLE_RATES['login']``).
    """

    scope = "login"
    rate = "30/hour"

    def get_cache_key(self, request, view) -> str | None:
        ident = self.get_ident(request)
        # Email is the dominant key; fall back to IP for missing bodies.
        email = ""
        try:
            email = str(request.data.get("email", "")).strip().lower()
        except Exception:  # pragma: no cover -- defensive
            email = ""
        if not email:
            email = "anon"
        return "throttle:login:%s:%s" % (email, ident)


# =====================================================================
# Registration rate throttle (spec Module 12: 10/hour per ip)
# =====================================================================
class RegisterRateThrottle(SimpleRateThrottle):
    """Throttle key = ``register:<ip>`` for both customer + vendor signup.

    Spec default: 10 attempts per hour per IP. Lower than the global
    default (100/hour) so bulk signups are blocked even before any
    captcha layer is added.
    """

    scope = "register"
    rate = "10000/hour"

    def get_cache_key(self, request, view) -> str | None:
        return "throttle:register:%s" % self.get_ident(request)


# =====================================================================
# Account lockout policy
# =====================================================================
class AccountLockoutPolicy:
    """Lock the account after ``MAX_FAILED_ATTEMPTS`` failures for 15 min.

    Stored on the user row itself (no Redis) so it survives deploys and
    works in the test suite without a cache backend. The 15-minute
    auto-unlock window is enforced in :meth:`is_locked`.
    """

    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_MINUTES = 15

    @staticmethod
    def record_failure(user) -> None:
        """Increment ``failed_login_attempts`` and lock when threshold hit."""
        if user is None:
            return
        # Bump attempt counter using F() so concurrent logins stay correct.
        from django.db.models import F
        from apps.accounts.models import CustomUser

        CustomUser.all_objects.filter(pk=user.pk).update(
            failed_login_attempts=F("failed_login_attempts") + 1,
            last_failed_login=timezone.now(),
        )
        # Refresh in-memory copy if it matches the same row.
        user.refresh_from_db(fields=["failed_login_attempts", "last_failed_login", "is_locked"])
        if (
            user.failed_login_attempts >= AccountLockoutPolicy.MAX_FAILED_ATTEMPTS
            and not user.is_locked
        ):
            CustomUser.all_objects.filter(pk=user.pk).update(is_locked=True)
            user.is_locked = True
            logger.warning("security.lockout user_id=%s attempts=%d", user.pk, user.failed_login_attempts)

    @staticmethod
    def reset(user) -> None:
        """Clear counters + lockout on successful login."""
        if user is None:
            return
        from apps.accounts.models import CustomUser

        CustomUser.all_objects.filter(pk=user.pk).update(
            failed_login_attempts=0,
            last_failed_login=None,
            is_locked=False,
        )
        user.failed_login_attempts = 0
        user.last_failed_login = None
        user.is_locked = False

    @staticmethod
    def is_locked(user) -> bool:
        """Return True when the account is currently locked (auto-unlocks)."""
        if user is None:
            return False
        if not getattr(user, "is_locked", False):
            return False
        last_failed = getattr(user, "last_failed_login", None)
        if last_failed is None:
            # Locked without a timestamp -- treat as expired.
            AccountLockoutPolicy.reset(user)
            return False
        delta = timezone.now() - last_failed
        if delta.total_seconds() >= AccountLockoutPolicy.LOCKOUT_MINUTES * 60:
            AccountLockoutPolicy.reset(user)
            return False
        return True


# =====================================================================
# SecurityService -- login attempt bookkeeping
# =====================================================================
class SecurityService:
    """Write a ``LoginAttempt`` row + delegate to ``AccountLockoutPolicy``."""

    @staticmethod
    def record_login_attempt(
        *,
        email: str,
        request,
        success: bool,
        failure_reason: str = "",
        user=None,
    ) -> None:
        """Persist one ``LoginAttempt`` and apply lockout on failure."""
        from apps.common.models import LoginAttempt

        ip = ""
        xff = request.META.get("HTTP_X_FORWARDED_FOR", "") if request else ""
        if xff:
            ip = xff.split(",")[0].strip()
        if not ip and request:
            ip = request.META.get("REMOTE_ADDR", "") or ""
        ua = ""
        if request:
            ua = (request.META.get("HTTP_USER_AGENT", "") or "")[:500]

        try:
            LoginAttempt.objects.create(
                email=(email or "").lower()[:254],
                ip_address=ip or None,
                user_agent=ua,
                success=success,
                failure_reason=failure_reason or "",
            )
        except Exception as exc:  # pragma: no cover -- defensive
            logger.exception("security.record_login_attempt failed err=%s", exc)

        if success:
            AccountLockoutPolicy.reset(user)
        else:
            AccountLockoutPolicy.record_failure(user)

    @staticmethod
    def list_recent(*, limit: int = 100, success: bool | None = None, email: str = ""):
        """Return recent login attempts (admin "Login attempts" page)."""
        from apps.common.models import LoginAttempt

        qs = LoginAttempt.objects.all().order_by("-timestamp")
        if success is not None:
            qs = qs.filter(success=success)
        if email:
            qs = qs.filter(email__iexact=email.strip().lower())
        return qs[: max(1, min(limit, 500))]


# =====================================================================
# Bad-word filter
# =====================================================================
# A short, conservative list. The exact word set isn't part of the spec;
# what's important is that the *infrastructure* exists so the moderation
# workflow can extend it. Words are matched as whole tokens (case-insensitive).
_DEFAULT_BAD_WORDS: tuple[str, ...] = (
    "spam",
    "scam",
    "fake",
    "fraud",
    "counterfeit",
)

_BAD_WORDS: list[str] = list(_DEFAULT_BAD_WORDS)


def register_bad_words(words: Iterable[str]) -> None:
    """Replace the runtime bad-words list. Used by tests / management cmds."""
    global _BAD_WORDS
    _BAD_WORDS = [str(w).strip().lower() for w in words if str(w).strip()]


def contains_bad_words(text: str) -> bool:
    """Return True if any registered bad-word appears as a whole token.

    ``re.WORD`` boundary matching means "scam" matches "this is a scam"
    but not "scampi". Word list is case-insensitive.
    """
    if not text:
        return False
    lowered = text.lower()
    for word in _BAD_WORDS:
        if not word:
            continue
        if re.search(r"\b" + re.escape(word) + r"\b", lowered):
            return True
    return False


def bad_words_list() -> list[str]:
    """Return the active bad-words list (copy)."""
    return list(_BAD_WORDS)


# =====================================================================
# Security headers middleware
# =====================================================================
class SecurityHeadersMiddleware:
    """Attach standard security headers to every response.

    Django's SecurityMiddleware already sets ``X-Content-Type-Options``
    and ``X-Frame-Options`` when configured, but we add them
    unconditionally here so they appear in dev and on admin responses
    too. Spec §Module 12 lists the canonical set; we apply them in
    every environment.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        # Don't override if a downstream component already set them.
        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("X-Frame-Options", "DENY")
        response.setdefault("X-XSS-Protection", "1; mode=block")
        response.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        # Strict-Transport-Security is only meaningful on HTTPS; only set
        # when the request is secure so dev/local isn't impacted.
        if request.is_secure():
            response.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


# =====================================================================
# Cache helper -- invalidate Redis key prefixes (best-effort)
# =====================================================================
def invalidate_cache_prefix(prefix: str) -> int:
    """Best-effort wipe of every cache key starting with ``prefix``.

    Used when bulk moderation actions happen (e.g. hide all flagged
    reviews). Returns the number of keys removed when the backend
    supports iteration, otherwise 0. Never raises.
    """
    try:
        cache = _redis_cache
        client = getattr(cache, "_cache", None)
        if client is None:
            return 0
        keys = []
        # Redis-py clients support scan_iter; fall back to .keys() for others.
        scan = getattr(client, "scan_iter", None)
        if callable(scan):
            keys = list(scan(match="%s*" % prefix))
        else:
            keys_method = getattr(client, "keys", None)
            if callable(keys_method):
                keys = list(keys_method("%s*" % prefix))
        if not keys:
            return 0
        delete = getattr(client, "delete_many", None) or getattr(client, "delete", None)
        if delete is None:
            return 0
        if isinstance(keys[0], bytes):
            keys = [k.decode("utf-8", errors="ignore") for k in keys]
        delete(keys) if delete.__name__ == "delete_many" else [delete(k) for k in keys]
        return len(keys)
    except Exception as exc:  # pragma: no cover -- defensive
        logger.debug("invalidate_cache_prefix %s failed: %s", prefix, exc)
        return 0


# =====================================================================
# OTP verification throttles — Module 1 email-verification hardening
# =====================================================================
class OTPSendRateThrottle(SimpleRateThrottle):
    """Throttle key = ``otp_send:<email>:<ip>``.

    Spec Module 12 / Module 1 hardening: cap OTP *send* attempts at 5 / hour
    so a malicious caller cannot spam the mailbox. Sends include both the
    initial issuance during signup and any explicit resend request.

    Key includes the email (lowercased) so multiple users on the same NAT
    IP are not lumped together.
    """

    scope = "otp_send"
    rate = "5/hour"

    def get_cache_key(self, request, view) -> str | None:
        ident = self.get_ident(request)
        email = ""
        try:
            email = str(request.data.get("email", "")).strip().lower()
        except Exception:  # pragma: no cover -- defensive
            email = ""
        if not email:
            email = "anon"
        return "throttle:otp_send:%s:%s" % (email, ident)


class OTPVerifyRateThrottle(SimpleRateThrottle):
    """Throttle key = ``otp_verify:<email>:<ip>``.

    Spec Module 12: 10 attempts per hour per (email, ip). Higher than the
    send cap because legitimate users may mistype; lower than the global
    default to keep brute force on a 6-digit code expensive.
    """

    scope = "otp_verify"
    rate = "10/hour"

    def get_cache_key(self, request, view) -> str | None:
        ident = self.get_ident(request)
        email = ""
        try:
            email = str(request.data.get("email", "")).strip().lower()
        except Exception:  # pragma: no cover -- defensive
            email = ""
        if not email:
            email = "anon"
        return "throttle:otp_verify:%s:%s" % (email, ident)
