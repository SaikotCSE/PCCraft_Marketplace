"""DRF spectacular helpers for views that use the API envelope.

The vast majority of our views return ``api_response(...)`` and don't have
a single, statically-typeable ``serializer_class`` that spectacular can
infer. That generates 90+ ``unable to guess serializer`` errors during
``python manage.py spectacular``.

Rather than annotate every view by hand we expose:

* :class:`ErrorEnvelopeSerializer` -- mirrors the ``error`` block that
  :func:`apps.common.response.api_response` produces (with ``code``,
  ``message``, and optional ``fields``).
* :class:`SuccessEnvelopeSerializer` -- mirrors the ``data`` block
  delivered on 2xx (mirrors the ``success``/``data``/``meta``/``error``
  envelope shape produced by ``APIResponse``).
* :func:`enveloped_schema` -- returns an ``extend_schema_view`` decorator
  that wraps a (method, status_code) → serializer mapping suitable for
  the ``responses`` kwarg of :func:`drf_spectacular.utils.extend_schema`.

Usage (per view, in ``views.py``)::

    from apps.common.spectacular_schema import enveloped_schema

    @api_view(["GET"])
    @enveloped_schema(("200", SuccessEnvelopeSerializer))
    def trending(request):
        ...

For ``APIView`` subclasses prefer the ``@extend_schema`` decorator with
``responses=enveloped_responses(...)`` directly.
"""
from __future__ import annotations

from typing import Iterable, Tuple

from drf_spectacular.utils import extend_schema
from rest_framework import serializers


class ErrorEnvelopeSerializer(serializers.Serializer):
    """Stable ``error`` block returned by ``api_response(..., error=...)``."""

    code = serializers.CharField(help_text="Stable machine-readable code, e.g. ``validation_error``.")
    message = serializers.CharField(help_text="Human-readable error message.")
    fields = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField()),
        required=False,
        help_text="Per-field validation messages keyed by field name.",
    )


class SuccessEnvelopeSerializer(serializers.Serializer):
    """Envelope wrapped around every 2xx response.

    The ``data`` field is intentionally open (``Serializer`` instead of
    a typed serializer) so spectacular can still emit a schema even when
    the view returns a polymorphic payload -- the actual serializer is
    typically attached via ``@extend_schema`` per view.
    """

    success = serializers.BooleanField()
    data = serializers.JSONField(help_text="Endpoint-specific payload.")
    meta = serializers.JSONField(
        required=False,
        help_text="Pagination / counts / free-form metadata.",
    )
    error = ErrorEnvelopeSerializer(allow_null=True, required=False)


def enveloped_responses(*pairs: Tuple[str, type[serializers.Serializer]]) -> dict:
    """Build a ``responses`` mapping from ``(status_code, serializer)`` pairs.

    Each ``"2xx"``/``"4xx"``/``"5xx"`` key maps to the serializer we
    want spectacular to emit. We additionally attach an
    :class:`ErrorEnvelopeSerializer` to a handful of status codes so the
    OpenAPI doc captures the error envelope shape consumers should expect.
    """

    responses: dict = {}
    for code, serializer in pairs:
        responses[code] = serializer
    for err_code in ("400", "401", "403", "404", "409", "429", "500"):
        responses.setdefault(err_code, ErrorEnvelopeSerializer)
    return responses


def enveloped_schema(*pairs: Tuple[str, type[serializers.Serializer]], **kwargs):
    """``@extend_schema`` preset for function-based views.

    Equivalent to ``@extend_schema(responses=enveloped_responses(*pairs),
    **kwargs)`` -- lets us keep the per-view annotation a one-liner.
    """

    return extend_schema(responses=enveloped_responses(*pairs), **kwargs)


__all__ = [
    "ErrorEnvelopeSerializer",
    "SuccessEnvelopeSerializer",
    "enveloped_responses",
    "enveloped_schema",
]
