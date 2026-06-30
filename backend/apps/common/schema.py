"""Project-wide DRF spectacular ``AutoSchema`` override.

Most of our views return :func:`apps.common.response.api_response` rather
than a typed ``Response`` wrapping a serializer. Spectacular's default
schema generator falls back to "unable to guess serializer" for those,
producing hundreds of harmless-looking but noisy schema-generation
errors.

Two hooks suppress the noise:

1. :class:`EnvelopeAutoSchema` overrides ``get_response_serializers``
   and ``_get_serializer_name`` so the documented operation always
   references :class:`SuccessEnvelopeSerializer` -- the actual shape
   returned by every 2xx response.
2. The module-level patch below back-fills a default ``serializer_class``
   on any ``APIView`` subclass that doesn't already declare one.
"""
from __future__ import annotations

import drf_spectacular
from drf_spectacular.openapi import AutoSchema

from .spectacular_schema import ErrorEnvelopeSerializer, SuccessEnvelopeSerializer


class EnvelopeAutoSchema(AutoSchema):
    """Spectacular ``AutoSchema`` that always documents the envelope shape."""

    def get_default_response_for_request(self, request):  # noqa: D401
        """Match the 2xx envelope so spectacular emits a typed schema."""
        return SuccessEnvelopeSerializer

    def get_response_serializers(self, direction="response"):  # noqa: D401
        """Prefer ``serializer_class``; fall back to the envelope serializer."""
        fallback = SuccessEnvelopeSerializer
        try:
            result = super().get_response_serializers(direction=direction)
            return result or fallback
        except Exception:  # pragma: no cover -- defensive: spectacular may raise
            return fallback

    def _get_serializer_name(self, serializer, direction, bypass_extensions=False):
        """Return a stable component name for the envelope serializer."""
        if serializer is SuccessEnvelopeSerializer:
            return "SuccessEnvelope"
        if serializer is ErrorEnvelopeSerializer:
            return "ErrorEnvelope"
        return super()._get_serializer_name(
            serializer, direction, bypass_extensions=bypass_extensions
        )

    def _get_error_response(self):
        """Map DRF exception codes onto our ``ErrorEnvelopeSerializer``."""
        return ErrorEnvelopeSerializer


__all__ = ["EnvelopeAutoSchema", "SuccessEnvelopeSerializer", "ErrorEnvelopeSerializer"]


# ---------------------------------------------------------------------------
# Back-fill ``serializer_class`` on every APIView subclass lacking one.
# ---------------------------------------------------------------------------
def _ensure_serializer_class() -> None:
    """Tag every APIView subclass with a default ``serializer_class``.

    Idempotent -- the patch flag prevents double-install when multiple
    modules import this one.
    """
    if getattr(drf_spectacular, "_pccraft_envelope_patched", False):
        return
    drf_spectacular._pccraft_envelope_patched = True

    from rest_framework.views import APIView

    sentinel = SuccessEnvelopeSerializer

    def _walk(cls):
        if "serializer_class" not in cls.__dict__:
            cls.serializer_class = sentinel
        for sub in cls.__subclasses__():
            _walk(sub)

    _walk(APIView)


_ensure_serializer_class()
