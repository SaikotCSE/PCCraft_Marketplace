"""Shared cache helper for the recommendations app.

Strategies cache their result list (a JSON-encoded list of product IDs)
under well-known keys with TTLs from the spec (Module 7 §7.1). The
helper silently degrades to "no cache" if Redis is unavailable so the
public endpoints stay online even if the cache layer is down -- we
just recompute on the next request.

Product IDs may be UUIDs (the canonical ``Product.id`` type) or plain
ints (older fixtures); both are normalised to ``str`` for JSON
serialisation and then passed back to callers as the original type
they returned.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable

from django.core.cache import cache

logger = logging.getLogger(__name__)


def _coerce(raw: Any) -> list:
    """Decode a JSON list value or return ``[]`` on any error."""
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if isinstance(data, list):
        return data
    return []


def cached_list(
    key: str,
    ttl: int,
    producer: Callable[[], list],
) -> list:
    """Return the cached list at ``key`` or compute + store it.

    Values may be any JSON-serialisable scalar; UUIDs and ints are both
    accepted. Returned values preserve whatever type the producer gave
    us (so a UUID stays a UUID on cache hits).
    """
    try:
        raw = cache.get(key)
    except Exception:  # noqa: BLE001 -- cache outages must not break views
        logger.warning("rec cache GET failed key=%s; computing live", key)
        return producer()

    if raw is not None:
        data = _coerce(raw)
        if data:
            return data

    value = producer()
    try:
        # serialise UUID -> str so JSON encoding works.
        payload = json.dumps([str(x) for x in value])
        cache.set(key, payload, timeout=ttl)
    except Exception:  # noqa: BLE001
        logger.warning("rec cache SET failed key=%s; skipping write", key)
    return value


def invalidate(key: str) -> None:
    try:
        cache.delete(key)
    except Exception:  # noqa: BLE001
        logger.warning("rec cache DELETE failed key=%s; ignoring", key)
