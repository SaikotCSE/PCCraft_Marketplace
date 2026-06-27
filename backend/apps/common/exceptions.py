"""Project-wide DRF exception handler.

Every DRF error is wrapped in the ``APIResponse`` envelope so the
frontend never has to special-case ``{"detail": ...}`` shapes.

Behaviour:
- ``ValidationError`` → ``error.code="validation_error"``,
  ``error.fields`` carries per-field messages.
- ``AuthenticationFailed`` → 401, ``code="unauthenticated"``.
- ``PermissionDenied`` → 403, ``code="permission_denied"``.
- ``NotFound`` → 404, ``code="not_found"``.
- Anything else → 500, ``code="server_error"`` (message safe for prod).
"""
from __future__ import annotations

import logging
from typing import Any

from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def _normalise(exc: Exception, payload: dict[str, Any]) -> dict[str, Any]:
    """Translate a DRF ``exc`` + ``payload`` into our ``error`` block."""
    if isinstance(exc, exceptions.ValidationError):
        return {
            "code": "validation_error",
            "message": "One or more fields failed validation.",
            "fields": payload.get("detail") if isinstance(payload.get("detail"), dict) else {},
            "detail": payload.get("detail") if not isinstance(payload.get("detail"), dict) else None,
        }
    if isinstance(exc, exceptions.AuthenticationFailed):
        return {"code": "unauthenticated", "message": str(exc.detail)}
    if isinstance(exc, exceptions.NotAuthenticated):
        return {"code": "unauthenticated", "message": "Authentication credentials were not provided."}
    if isinstance(exc, exceptions.PermissionDenied):
        return {"code": "permission_denied", "message": str(exc.detail)}
    if isinstance(exc, exceptions.NotFound):
        return {"code": "not_found", "message": str(exc.detail)}
    if isinstance(exc, exceptions.MethodNotAllowed):
        return {"code": "method_not_allowed", "message": str(exc.detail)}
    if isinstance(exc, exceptions.Throttled):
        return {"code": "throttled", "message": str(exc.detail)}
    if isinstance(exc, exceptions.APIException):
        return {"code": getattr(exc, "default_code", "api_error"), "message": str(exc.detail)}
    return {"code": "server_error", "message": "Internal server error."}


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """Drop-in replacement for ``REST_FRAMEWORK['EXCEPTION_HANDLER']``."""
    response = drf_exception_handler(exc, context)
    if response is None:
        # Unhandled exception -- let Django emit the 500, but log with context.
        logger.exception("Unhandled exception in view %s", context.get("view"))
        return None

    error = _normalise(exc, response.data if isinstance(response.data, dict) else {})
    return Response(
        data={
            "success": False,
            "data": None,
            "meta": {},
            "error": error,
        },
        status=response.status_code,
        headers=response.headers if hasattr(response, "headers") else None,
    )