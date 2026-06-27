"""Smoke views used by Module 0's "both servers boot" check."""
from __future__ import annotations

from django.db import connection
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


# Module 0 backwards-compat alias -- used by urls.py imports below.
ping = PingView.as_view()