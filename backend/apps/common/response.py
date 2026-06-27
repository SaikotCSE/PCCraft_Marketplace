"""Uniform JSON envelope for every API response.

Every DRF view (and any direct helper) should return ``APIResponse``
rather than DRF's ``Response`` so the frontend can rely on a single
shape::

    {
        "success": true,
        "data": { ... },
        "meta":  { ... },        // pagination, counts, etc.
        "error": null
    }

Failures flip ``success=false`` and populate ``error`` with a stable
``code`` plus a human-readable ``message``.
"""
from __future__ import annotations

from typing import Any, Mapping

from rest_framework import status as drf_status
from rest_framework.response import Response


class APIResponse(Response):
    """DRF ``Response`` that wraps payload in our envelope."""

    def __init__(
        self,
        data: Any | None = None,
        *,
        status: int = drf_status.HTTP_200_OK,
        meta: Mapping[str, Any] | None = None,
        error: Mapping[str, Any] | None = None,
        success: bool | None = None,
        headers: Mapping[str, str] | None = None,
        exception: bool = False,
        content_type: str | None = None,
    ) -> None:
        envelope: dict[str, Any] = {
            "success": success if success is not None else error is None,
            "data": data,
            "meta": dict(meta or {}),
            "error": dict(error) if error is not None else None,
        }
        super().__init__(
            data=envelope,
            status=status,
            headers=headers,
            exception=exception,
            content_type=content_type,
        )


def api_response(
    data: Any | None = None,
    *,
    status: int = drf_status.HTTP_200_OK,
    meta: Mapping[str, Any] | None = None,
    error: Mapping[str, Any] | None = None,
) -> APIResponse:
    """Functional helper -- equivalent to ``APIResponse(...)``."""
    return APIResponse(data=data, status=status, meta=meta, error=error)