"""Dashboard analytics services -- Module 9.

All aggregation queries live here so the views stay thin and so the
math is testable in isolation. Every helper returns plain ``list`` /
``dict`` payloads ready to be wrapped in ``api_response``.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import (
    Count,
    DecimalField,
    F,
    Q,
    Sum,
)
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.accounts.models import CustomUser, UserRole, VendorProfile, VendorStatus
from apps.orders.models import Order, OrderItem
from apps.products.models import Product, ProductStatus


# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------
_PAID_ORDER_FILTER = (
    Q(payment_status="PAID")
    | Q(status__in=("CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"))
)
"""Orders that count as real revenue.

A paid-but-not-yet-shipped order is still revenue. We intentionally
treat every order past ``PENDING_PAYMENT`` as revenue regardless of
``payment_status`` so the chart matches the finance team's mental
model: once the customer confirms the order, money is in motion.
"""

_MAX_DAYS_WINDOW = 365
"""Hard cap on ?days= query param -- protects DB from 10-year windows."""

# Spec §Module 9 (line 3119): dashboard time series accept a
# ``?range=7d|30d|90d`` shorthand so the React filter chips can drive
# every chart with one query string. We also still accept the legacy
# ``?days=N`` so custom windows (14, 60, etc.) keep working -- the new
# shorthand just maps to the same underlying day window.
_RANGE_SHORTHANDS: dict[str, int] = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
}
"""``?range=`` -> days lookup table. Anything else falls back to 30d."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _parse_days(request, default: int = 30) -> int:
    """Parse and clamp the ``?days=N`` query param."""
    raw = request.query_params.get("days", str(default))
    try:
        days = int(raw)
    except (TypeError, ValueError):
        days = default
    return max(1, min(days, _MAX_DAYS_WINDOW))


def _parse_range(request, default: int = 30) -> tuple[int, str]:
    """Parse ``?range=7d|30d|90d`` (preferred) or ``?days=N`` (legacy).

    Returns ``(days, label)`` where ``label`` is the shorthand the
    client sent (or ``"Nd"`` derived from a custom window). The
    ``label`` is useful when echoing the resolved range back to the
    frontend so the active chip can be highlighted without re-parsing
    the URL on the client.
    """
    qp = request.query_params
    range_token = (qp.get("range") or "").strip().lower()
    if range_token in _RANGE_SHORTHANDS:
        days = _RANGE_SHORTHANDS[range_token]
        return max(1, min(days, _MAX_DAYS_WINDOW)), range_token

    # Legacy ``?days=N`` path -- accept any positive integer.
    days_raw = (qp.get("days") or "").strip()
    if days_raw:
        try:
            days = int(days_raw)
            days = max(1, min(days, _MAX_DAYS_WINDOW))
            return days, f"{days}d"
        except (TypeError, ValueError):
            pass

    return default, f"{default}d"


def _parse_limit(request, default: int = 10) -> int:
    """Parse and clamp the ``?limit=N`` query param."""
    raw = request.query_params.get("limit", str(default))
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        limit = default
    return max(1, min(limit, 100))


def _decimal(value) -> float:
    """Coerce Decimal/None to float for JSON."""
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


# ---------------------------------------------------------------------------
# Overview KPIs
# ---------------------------------------------------------------------------
def build_overview() -> dict:
    """Single-card answer to "how is the marketplace doing right now?"

    All counts are simple ``.count()`` calls against indexed FK columns.
    Revenue sums are filtered through ``_PAID_ORDER_FILTER`` so cancelled
    / pending orders never inflate the number.
    """
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    revenue_qs = Order.objects.filter(_PAID_ORDER_FILTER)
    today_qs = revenue_qs.filter(created_at__gte=today_start)

    total_revenue = _decimal(revenue_qs.aggregate(s=Sum("total"))["s"])
    revenue_today = _decimal(today_qs.aggregate(s=Sum("total"))["s"])

    return {
        "total_users": CustomUser.objects.count(),
        "total_vendors": VendorProfile.objects.filter(status=VendorStatus.APPROVED).count(),
        "total_products": Product.objects.filter(status=ProductStatus.ACTIVE, is_active=True).count(),
        "total_orders": Order.objects.count(),
        "total_revenue": total_revenue,
        "orders_today": today_qs.count(),
        "revenue_today": revenue_today,
        "pending_vendors": VendorProfile.objects.filter(status=VendorStatus.PENDING).count(),
        "pending_products": Product.objects.filter(status=ProductStatus.DRAFT).count(),
        "low_stock_products": Product.objects.filter(
            status=ProductStatus.ACTIVE,
            is_active=True,
            stock_quantity__lte=F("low_stock_threshold"),
        ).count(),
        "generated_at": now.isoformat(),
    }


# ---------------------------------------------------------------------------
# Time series
# ---------------------------------------------------------------------------
def build_orders_over_time(days: int) -> dict:
    """Order count grouped by day for the trailing ``days`` window."""
    now = timezone.now()
    window_start = (now - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )

    rows = (
        Order.objects
        .filter(created_at__gte=window_start)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(count=Count("id"), revenue=Sum("total"))
        .order_by("day")
    )

    series = [
        {
            "date": row["day"].isoformat(),
            "orders": row["count"],
            "revenue": _decimal(row["revenue"]),
        }
        for row in rows
    ]

    return {
        "days": days,
        "from": window_start.date().isoformat(),
        "to": now.date().isoformat(),
        "series": series,
    }


def build_revenue_over_time(days: int) -> dict:
    """Revenue grouped by day, restricted to ``_PAID_ORDER_FILTER``."""
    now = timezone.now()
    window_start = (now - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )

    rows = (
        Order.objects
        .filter(_PAID_ORDER_FILTER, created_at__gte=window_start)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(revenue=Sum("total"), orders=Count("id"))
        .order_by("day")
    )

    series = [
        {
            "date": row["day"].isoformat(),
            "revenue": _decimal(row["revenue"]),
            "orders": row["orders"],
        }
        for row in rows
    ]

    total = sum(item["revenue"] for item in series)

    return {
        "days": days,
        "total": total,
        "from": window_start.date().isoformat(),
        "to": now.date().isoformat(),
        "series": series,
    }


# ---------------------------------------------------------------------------
# Ranked lists
# ---------------------------------------------------------------------------
def build_top_products(limit: int) -> dict:
    """Top-selling products by quantity sold across all paid orders."""
    rows = (
        OrderItem.objects
        .filter(order__in=Order.objects.filter(_PAID_ORDER_FILTER))
        .filter(product__isnull=False)
        .values(
            "product_id",
            "product_name_snapshot",
            "primary_image_url",
        )
        .annotate(
            quantity_sold=Sum("quantity"),
            revenue=Sum(F("quantity") * F("unit_price"), output_field=DecimalField(max_digits=14, decimal_places=2)),
        )
        .order_by("-quantity_sold")[:limit]
    )

    items = [
        {
            "product_id": row["product_id"],
            "name": row["product_name_snapshot"],
            "image": row["primary_image_url"],
            "quantity_sold": int(row["quantity_sold"] or 0),
            "revenue": _decimal(row["revenue"]),
        }
        for row in rows
    ]

    return {"limit": limit, "items": items}


def build_top_vendors(limit: int) -> dict:
    """Top vendors by revenue, restricted to paid orders."""
    rows = (
        OrderItem.objects
        .filter(order__in=Order.objects.filter(_PAID_ORDER_FILTER))
        .values(
            "vendor_id",
            "vendor__business_name",
            "vendor__user__email",
        )
        .annotate(
            quantity_sold=Sum("quantity"),
            revenue=Sum(F("quantity") * F("unit_price"), output_field=DecimalField(max_digits=14, decimal_places=2)),
            orders=Count("order_id", distinct=True),
        )
        .order_by("-revenue")[:limit]
    )

    items = [
        {
            "vendor_id": row["vendor_id"],
            "business_name": row["vendor__business_name"],
            "email": row["vendor__user__email"],
            "quantity_sold": int(row["quantity_sold"] or 0),
            "revenue": _decimal(row["revenue"]),
            "orders": row["orders"],
        }
        for row in rows
    ]

    return {"limit": limit, "items": items}


# ---------------------------------------------------------------------------
# Distributions
# ---------------------------------------------------------------------------
def build_category_distribution() -> dict:
    """Active products grouped by category -- for the pie/donut chart."""
    rows = (
        Product.objects
        .filter(status=ProductStatus.ACTIVE, is_active=True)
        .values("category_id", "category__name")
        .annotate(products=Count("id"))
        .order_by("-products")
    )

    items = [
        {
            "category_id": row["category_id"],
            "name": row["category__name"],
            "products": row["products"],
        }
        for row in rows
    ]

    return {"items": items}


# ---------------------------------------------------------------------------
# User growth
# ---------------------------------------------------------------------------
def build_user_growth(days: int) -> dict:
    """New-user count per day for the trailing window."""
    now = timezone.now()
    window_start = (now - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )

    rows = (
        CustomUser.objects
        .filter(date_joined__gte=window_start)
        .annotate(day=TruncDate("date_joined"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )

    series = [
        {"date": row["day"].isoformat(), "users": row["count"]}
        for row in rows
    ]

    return {
        "days": days,
        "from": window_start.date().isoformat(),
        "to": now.date().isoformat(),
        "series": series,
        "by_role": {
            "customer": CustomUser.objects.filter(role=UserRole.CUSTOMER).count(),
            "vendor": CustomUser.objects.filter(role=UserRole.VENDOR).count(),
            "admin": CustomUser.objects.filter(role=UserRole.ADMIN).count(),
        },
    }