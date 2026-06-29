"""Vendor-scoped dashboard analytics -- Module 10.

The admin dashboard in ``apps.dashboard.services`` aggregates platform-wide
metrics; this module mirrors that surface but scopes every query to a single
``VendorProfile``. Every helper accepts the resolved ``vendor_profile`` and
returns plain ``list``/``dict`` payloads ready to be wrapped in ``api_response``.

Design notes
------------
* We reuse the same ``_PAID_ORDER_FILTER`` mental model as the admin module:
  once an order is past ``PENDING_PAYMENT`` it is "real" revenue.
* The vendor's ``low_stock_threshold`` is a per-vendor override; products
  without an explicit threshold fall back to the vendor profile value.
* ``OrderItem.vendor`` is a FK on the order item, so revenue is computed at
  the line level (which respects multi-vendor carts naturally).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Iterable, List, Sequence

from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.accounts.models import VendorProfile
from apps.orders.models import Order, OrderItem, ReturnRequest, ReturnStatus
from apps.products.models import Product, ProductImage, ProductStatus


# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------
_RANGE_TO_DAYS: dict[str, int] = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
}
"""Map the spec's ``?range=`` values to day windows."""

_DEFAULT_RANGE = "30d"
"""Default range when the query param is missing or invalid."""

_MAX_RANGE_DAYS = max(_RANGE_TO_DAYS.values())
"""Hard upper bound used when validating arbitrary ``?days=`` params."""

_VENDOR_REVENUE_FILTER = (
    Q(payment_status="PAID")
    | Q(status__in=("CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"))
)
"""Same revenue rule as the admin module, applied at the OrderItem level."""

_ACTIVE_RETURN_STATUSES = frozenset({
    ReturnStatus.PENDING,
    ReturnStatus.APPROVED,
    ReturnStatus.SHIPPED_BACK,
    ReturnStatus.RECEIVED,
    ReturnStatus.REFUND_INITIATED,
})
"""Returns still in motion -- the vendor is responsible for the next step."""


# ---------------------------------------------------------------------------
# Param parsing
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class RangeWindow:
    """Resolved [start, end] date window used by time-series queries."""

    start: date
    end: date
    days: int

    def as_dates(self) -> Sequence[date]:
        """Yield every date in the window, inclusive on both ends."""
        return [self.start + timedelta(days=i) for i in range(self.days + 1)]


def parse_range(request) -> RangeWindow:
    """Resolve ``?range=`` into a concrete window.

    Accepts ``7d``, ``30d``, ``90d`` -- anything else falls back to the
    default (30d) so a typo never produces an unbounded query.
    """
    raw = (request.query_params.get("range") or _DEFAULT_RANGE).lower()
    days = _RANGE_TO_DAYS.get(raw, _RANGE_TO_DAYS[_DEFAULT_RANGE])
    today = timezone.localdate()
    return RangeWindow(start=today - timedelta(days=days), end=today, days=days)


def parse_limit(request, default: int = 5, ceiling: int = 50) -> int:
    """Parse and clamp ``?limit=N`` for ranking endpoints."""
    raw = request.query_params.get("limit", str(default))
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        limit = default
    return max(1, min(limit, ceiling))


def _coerce_float(value) -> float:
    """Decimal/None → float for JSON. Floats pass through unchanged."""
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


# ---------------------------------------------------------------------------
# KPI bundle
# ---------------------------------------------------------------------------
def build_overview(vendor_profile: VendorProfile) -> dict:
    """Aggregate the headline KPIs shown on the vendor dashboard.

    Returns
    -------
    dict
        Keys match the Module 10 spec exactly: ``total_products``,
        ``active_products``, ``total_orders``, ``pending_orders``,
        ``shipped_orders``, ``total_revenue_all_time``,
        ``revenue_this_month``, ``active_returns``,
        ``low_stock_products_count``.
    """
    product_qs = Product.objects.filter(vendor=vendor_profile)
    total_products = product_qs.count()
    active_products = product_qs.filter(status=ProductStatus.ACTIVE).count()

    # All orders that contain at least one line from this vendor.
    item_qs = OrderItem.objects.filter(vendor=vendor_profile)
    order_ids = item_qs.values_list("order_id", flat=True).distinct()
    order_qs = Order.objects.filter(id__in=order_ids)
    total_orders = order_qs.count()
    pending_orders = order_qs.filter(status="PENDING_PAYMENT").count()
    shipped_orders = order_qs.filter(
        status__in=("SHIPPED", "OUT_FOR_DELIVERY")
    ).count()

    revenue_qs = item_qs.filter(_VENDOR_REVENUE_FILTER)
    total_revenue_all_time = revenue_qs.aggregate(
        total=Coalesce(
            Sum(F("unit_price") * F("quantity"), output_field=DecimalField()),
            Value(Decimal("0")),
            output_field=DecimalField(),
        )
    )["total"] or Decimal("0")

    month_start = timezone.localdate().replace(day=1)
    revenue_this_month = revenue_qs.filter(
        order__created_at__date__gte=month_start
    ).aggregate(
        total=Coalesce(
            Sum(F("unit_price") * F("quantity"), output_field=DecimalField()),
            Value(Decimal("0")),
            output_field=DecimalField(),
        )
    )["total"] or Decimal("0")

    active_returns = ReturnRequest.objects.filter(
        order_item__vendor=vendor_profile,
        status__in=_ACTIVE_RETURN_STATUSES,
    ).count()

    low_stock_products_count = _low_stock_products(vendor_profile).count()

    return {
        "total_products": total_products,
        "active_products": active_products,
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "shipped_orders": shipped_orders,
        "total_revenue_all_time": _coerce_float(total_revenue_all_time),
        "revenue_this_month": _coerce_float(revenue_this_month),
        "active_returns": active_returns,
        "low_stock_products_count": low_stock_products_count,
    }


# ---------------------------------------------------------------------------
# Time-series + ranking
# ---------------------------------------------------------------------------
def build_revenue_over_time(
    vendor_profile: VendorProfile, window: RangeWindow
) -> List[dict]:
    """Return ``[{date, revenue, order_count}]`` for the given window.

    Days with no orders still appear with zero values so the chart line
    starts at the leftmost edge of the window instead of jumping.
    """
    # NOTE: _VENDOR_REVENUE_FILTER is a Q-object and must be passed by
    # keyword (``filter(Q_obj, ...)``) because the date range lookups
    # are already keyword args -- Python forbids positional args after
    # keyword args in a single call.
    item_qs = (
        OrderItem.objects
        .filter(
            vendor=vendor_profile,
            order__created_at__date__gte=window.start,
            order__created_at__date__lte=window.end,
            **_VENDOR_REVENUE_FILTER,
        )
        .annotate(day=TruncDate("order__created_at"))
        .values("day")
        .annotate(
            revenue=Coalesce(
                Sum(F("unit_price") * F("quantity"), output_field=DecimalField()),
                Value(Decimal("0")),
                output_field=DecimalField(),
            ),
            order_count=Count("order_id", distinct=True),
        )
    )
    by_day = {
        row["day"]: (
            _coerce_float(row["revenue"]),
            int(row["order_count"] or 0),
        )
        for row in item_qs
    }
    return [
        {
            "date": d.isoformat(),
            "revenue": by_day.get(d, (0.0, 0))[0],
            "order_count": by_day.get(d, (0.0, 0))[1],
        }
        for d in window.as_dates()
    ]


def build_top_products(vendor_profile: VendorProfile, limit: int) -> List[dict]:
    """Return the vendor's top-selling products by revenue.

    Each row carries ``primary_image`` (URL or empty string) and
    ``current_stock`` so the frontend can render the table without a
    second round-trip.
    """
    item_qs = (
        OrderItem.objects
        .filter(vendor=vendor_profile, **_VENDOR_REVENUE_FILTER)
        .values("product_id")
        .annotate(
            total_sold=Coalesce(
                Sum("quantity"),
                Value(0),
                output_field=DecimalField(),
            ),
            revenue=Coalesce(
                Sum(F("unit_price") * F("quantity"), output_field=DecimalField()),
                Value(Decimal("0")),
                output_field=DecimalField(),
            ),
        )
        .order_by("-revenue")[:limit]
    )
    if not item_qs:
        return []

    product_ids = [row["product_id"] for row in item_qs]
    products_by_id = {
        p.pk: p
        for p in Product.objects.filter(pk__in=product_ids).select_related("vendor")
    }
    primary_images = _primary_images_for(product_ids)

    rows: List[dict] = []
    for row in item_qs:
        product = products_by_id.get(row["product_id"])
        if product is None:
            # Product deleted between aggregation and lookup -- skip safely.
            continue
        rows.append({
            "product_id": product.pk,
            "slug": product.slug,
            "name": product.name,
            "primary_image": primary_images.get(product.pk, ""),
            "total_sold": int(row["total_sold"] or 0),
            "revenue": _coerce_float(row["revenue"]),
            "current_stock": int(product.stock_quantity or 0),
        })
    return rows


def build_low_stock(vendor_profile: VendorProfile) -> List[dict]:
    """List products at or below the vendor's ``low_stock_threshold``."""
    products = list(
        _low_stock_products(vendor_profile)
        .order_by("stock_quantity", "name")
        .values("id", "slug", "name", "stock_quantity", "low_stock_threshold")
    )
    threshold = int(vendor_profile.low_stock_threshold or 5)
    out: List[dict] = []
    for row in products:
        row_threshold = row.get("low_stock_threshold") or threshold
        out.append({
            "product_id": row["id"],
            "slug": row["slug"],
            "name": row["name"],
            "stock_quantity": int(row["stock_quantity"] or 0),
            "low_stock_threshold": int(row_threshold),
        })
    return out


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _low_stock_products(vendor_profile: VendorProfile):
    """Products the vendor should restock.

    The effective threshold is ``product.low_stock_threshold`` when set,
    otherwise the vendor profile override (default 5). Products with zero
    stock are always included so they appear in the alert even if their
    stored threshold is 0.
    """
    qs = Product.objects.filter(vendor=vendor_profile, status=ProductStatus.ACTIVE)
    threshold = int(vendor_profile.low_stock_threshold or 5)
    return qs.filter(
        Q(stock_quantity__lte=F("low_stock_threshold"))
        | Q(stock_quantity__lte=threshold)
        | Q(stock_quantity=0)
    )


def _primary_images_for(product_ids: Iterable[int]) -> dict[int, str]:
    """Return ``{product_id: image_url}`` for primary images only."""
    rows = (
        ProductImage.objects
        .filter(product_id__in=list(product_ids), is_primary=True)
        .values("product_id", "image")
    )
    return {row["product_id"]: (row["image"] or "") for row in rows}