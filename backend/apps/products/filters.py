"""django-filter integration for products.

We annotate the queryset with ``effective_price_db`` so that
``min_price``/``max_price`` filters and ``?ordering=price`` can target
a single computed column rather than wrestling with Python properties.
"""
from __future__ import annotations

from django.db.models import Case, F, IntegerField, Q, Value, When
from django.utils import timezone
from django_filters import (
    BaseInFilter,
    BooleanFilter,
    CharFilter,
    FilterSet,
    NumberFilter,
    OrderingFilter,
)

from apps.products.models import Product


def _annotate_effective_price(qs):
    now = timezone.now()
    return qs.annotate(
        effective_price_db=Case(
            When(
                Q(discounted_price__isnull=False)
                & (
                    Q(discount_start__isnull=True, discount_end__isnull=True)
                    | Q(discount_start__lte=now, discount_end__gte=now)
                    | Q(discount_start__lte=now, discount_end__isnull=True)
                    | Q(discount_start__isnull=True, discount_end__gte=now)
                ),
                then=F("discounted_price"),
            ),
            default=F("base_price"),
            output_field=IntegerField(),
        ),
    )


class CharInFilter(BaseInFilter, CharFilter):
    """Comma-separated list of strings (e.g. brand slugs)."""

    pass


class ProductFilter(FilterSet):
    """Public catalog filter.

    * ``category`` — root or leaf slug; includes descendants.
    * ``brand``    — comma-separated list of brand slugs.
    * ``min_price``/``max_price`` — applied to the discounted price when
      the window is active, else the base price.
    * ``in_stock`` — boolean; matches ``stock_quantity > 0``.
    * ``featured`` — boolean; ``is_featured=True``.
    * ``is_featured`` is admin-set; ``featured=1`` is exposed publicly.
    """

    category = CharInFilter(method="filter_category")
    brand = CharInFilter(method="filter_brand")
    min_price = NumberFilter(method="filter_min_price")
    max_price = NumberFilter(method="filter_max_price")
    in_stock = BooleanFilter(method="filter_in_stock")
    featured = BooleanFilter(method="filter_featured")
    search = CharInFilter(method="filter_search")

    ordering = OrderingFilter(
        fields=(
            ("effective_price_db", "price"),
            ("-effective_price_db", "-price"),
            ("created_at", "created_at"),
            ("-created_at", "-created_at"),
            ("average_rating", "avg_rating"),
            ("-average_rating", "-avg_rating"),
            ("name", "name"),
        ),
    )

    class Meta:
        model = Product
        fields = ("category", "brand", "min_price", "max_price",
                  "in_stock", "featured", "search", "ordering")

    # ------------------------------------------------------------------
    # Filter implementations
    # ------------------------------------------------------------------
    def filter_queryset(self, queryset):
        # Apply price / ordering annotation up-front.
        qs = _annotate_effective_price(queryset)
        return super().filter_queryset(qs)

    def filter_category(self, queryset, name, value):
        from apps.categories.models import Category
        slugs = list(value)
        categories = list(Category.objects.filter(slug__in=slugs))
        if not categories:
            return queryset.none()
        ids = set()
        for cat in categories:
            ids.add(cat.pk)
            ids.update(cat.get_descendants().values_list("pk", flat=True))
        return queryset.filter(category_id__in=ids)

    def filter_brand(self, queryset, name, value):
        return queryset.filter(brand__slug__in=list(value))

    def filter_min_price(self, queryset, name, value):
        return queryset.filter(effective_price_db__gte=value)

    def filter_max_price(self, queryset, name, value):
        return queryset.filter(effective_price_db__lte=value)

    def filter_in_stock(self, queryset, name, value):
        if value:
            return queryset.filter(stock_quantity__gt=0)
        return queryset.filter(stock_quantity=0)

    def filter_featured(self, queryset, name, value):
        if value:
            return queryset.filter(is_featured=True)
        return queryset.filter(is_featured=False)

    def filter_search(self, queryset, name, value):
        term = (value or "").strip()
        if not term:
            return queryset
        return queryset.filter(
            Q(name__icontains=term)
            | Q(short_description__icontains=term)
            | Q(sku__icontains=term)
        )