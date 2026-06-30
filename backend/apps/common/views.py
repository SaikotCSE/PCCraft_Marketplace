"""Smoke views used by Module 0's "both servers boot" check."""
from __future__ import annotations

from django.db import connection
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.common.response import APIResponse


class PingView(APIView):
    """Cheap anonymous health probe used by the dev smoke test."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, *args, **kwargs):
        return APIResponse(data={"pong": True, "now": timezone.now().isoformat()})


class HealthCheckView(APIView):
    """Authenticated-or-not depending on ``DEFAULT_PERMISSION_CLASSES``.

    Returns ``{"status": "ok", "db": "ok", "now": ...}``. Hits the
    database so a misconfigured ``DATABASES`` fails loudly.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, *args, **kwargs):
        try:
            with connection.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            db_ok = True
        except Exception:  # pragma: no cover
            db_ok = False
        return APIResponse(
            data={
                "status": "ok" if db_ok else "degraded",
                "db": "ok" if db_ok else "down",
                "now": timezone.now().isoformat(),
            }
        )


# ---------------------------------------------------------------------------
# Top-level Django error handlers (handler400/403/404/500)
#
# Each function is referenced from ``config/urls.py`` and produces a JSON
# envelope rather than Django's default HTML response. We use
# ``JsonResponse`` directly here (no DRF machinery) so the handlers still
# work even if ``APIView`` is misconfigured.
# ---------------------------------------------------------------------------
def _envelope_error(status_code: int, code: str, message: str):
    """Render the standard ``{success:false, error:{...}}`` JSON envelope."""
    return JsonResponse(
        {
            "success": False,
            "data": None,
            "meta": {},
            "error": {"code": code, "message": message, "fields": {}},
        },
        status=status_code,
    )


def bad_request_handler(request, exception=None):
    """Django ``handler400`` -- 400 Bad Request envelope."""
    return _envelope_error(400, "bad_request", "The request could not be parsed.")


def permission_denied_handler(request, exception=None):
    """Django ``handler403`` -- 403 Forbidden envelope."""
    return _envelope_error(403, "permission_denied", "You do not have access to this resource.")


def not_found_handler(request, exception=None):
    """Django ``handler404`` -- 404 Not Found envelope."""
    return _envelope_error(404, "not_found", "The requested resource was not found.")


def server_error_handler(request, exception=None):
    """Django ``handler500`` -- 500 Server Error envelope."""
    return _envelope_error(500, "server_error", "An unexpected server error occurred.")


# Module 0 backwards-compat alias -- used by urls.py imports below.
ping = PingView.as_view()