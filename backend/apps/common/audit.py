"""Audit logging service -- Module 9.

Provides a single ``AuditService.log`` entry point that admin views call
after every moderation action. Persists to ``AuditLog`` (see
``apps.common.models``). Failures are swallowed and logged so an audit
write error never blocks the primary action -- the spec treats audit as
best-effort persistence.

Helpers
-------

* ``AuditService.log(actor, action, target_type='', target_id='', metadata=None, request=None)``
  -- one-liner to write a row.
* ``AuditService.from_request(request)`` -- convenience to attach
  IP + user-agent to a metadata dict before calling ``log``.
"""
from __future__ import annotations

import logging
from typing import Any, Mapping

from django.db import DatabaseError, transaction
from rest_framework.request import Request

from apps.common.models import AuditLog

logger = logging.getLogger(__name__)


class AuditService:
    """Thin static-method facade over the AuditLog model."""

    @staticmethod
    def from_request(request: Request | None) -> dict[str, Any]:
        """Return ``{ip_address, user_agent}`` extracted from a DRF request.

        Returns an empty dict when ``request`` is None (system actions).
        """
        if request is None:
            return {}
        ip = ""
        # ``X-Forwarded-For`` first hop wins when behind a proxy.
        xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if xff:
            ip = xff.split(",")[0].strip()
        if not ip:
            ip = request.META.get("REMOTE_ADDR", "") or ""
        ua = request.META.get("HTTP_USER_AGENT", "") or ""
        # Truncate aggressively so the column constraint isn't blown.
        ua = ua[:500]
        return {"ip_address": ip or None, "user_agent": ua}

    @staticmethod
    def log(
        *,
        action: str,
        actor: Any | None = None,
        target_type: str = "",
        target_id: str = "",
        metadata: Mapping[str, Any] | None = None,
        request: Request | None = None,
    ) -> AuditLog | None:
        """Persist an ``AuditLog`` row. Returns the row, or ``None`` on failure.

        ``metadata`` may be any JSON-serialisable mapping. Request-derived
        IP/UA are merged in automatically.
        """
        ctx_meta: dict[str, Any] = dict(metadata or {})
        req_ctx = AuditService.from_request(request)
        ip = req_ctx.get("ip_address")
        ua = req_ctx.get("user_agent", "")
        # Allow caller to override via metadata.ip_address / .user_agent
        if "ip_address" in ctx_meta:
            ip = ctx_meta.pop("ip_address")
        if "user_agent" in ctx_meta:
            ua = str(ctx_meta.pop("user_agent"))[:500]

        try:
            with transaction.atomic():
                row = AuditLog.objects.create(
                    actor=actor if (actor is None or getattr(actor, "pk", None)) else None,
                    action=action,
                    target_type=target_type,
                    target_id=str(target_id) if target_id is not None else "",
                    metadata=ctx_meta,
                    ip_address=ip,
                    user_agent=ua,
                )
            logger.info(
                "audit.log action=%s actor=%s target=%s:%s ip=%s",
                action,
                getattr(actor, "pk", None),
                target_type,
                target_id,
                ip,
            )
            return row
        except DatabaseError as exc:  # pragma: no cover -- defensive
            logger.exception("audit.log failed action=%s err=%s", action, exc)
            return None
        except Exception as exc:  # pragma: no cover -- defensive
            logger.exception("audit.log unexpected action=%s err=%s", action, exc)
            return None
