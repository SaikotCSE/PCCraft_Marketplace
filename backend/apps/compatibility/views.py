"""Views for the compatibility / PC Builder domain (Module 8).

Endpoint layout per ``PCCraft_Master_Spec_v4.md`` Module 8 / §2.10:

The same URL set is exposed under both prefixes so the spec's
canonical paths (``/api/v1/builds/``) and the in-tree prefix
(``/api/v1/compatibility/builds/``) both resolve:

* ``GET    /rules/``             -- admin only, list compatibility rules
* ``POST   /rules/``             -- admin only, create rule
* ``GET    /rules/<id>/``        -- admin only, retrieve rule
* ``PATCH  /rules/<id>/``        -- admin only, update rule
* ``DELETE /rules/<id>/``        -- admin only, delete rule
* ``POST   /check/``             -- public, run rule engine against slots
* ``GET    /products/<slot>/``   -- public, list compatible products
                                     for slot. Query keys per spec §2.10:
                                     ``cpu_id, mobo_id, ram1_id, ram2_id,
                                     gpu_id, psu_id, case_id, cooler_id,
                                     ssd1_id, ssd2_id, hdd_id, search``.
                                     Legacy ``?selected=<slot>:<id>``
                                     form is also accepted.
* ``GET    /builds/``            -- authenticated, list user's builds
                                     (spec §2.10: "On login: auto-POST
                                     to /api/v1/builds/")
* ``POST   /builds/``            -- authenticated, create or replace a build
* ``GET    /builds/<id>/``       -- owner or admin, retrieve build
* ``PATCH  /builds/<id>/``       -- owner or admin, update build slots
* ``DELETE /builds/<id>/``       -- owner or admin, delete build
* ``GET    /builds/share/<token>/`` -- public if ``is_public=True``
* ``GET    /attributes/``        -- admin only
* ``POST   /attributes/``        -- admin only
* ``GET    /attributes/<id>/``   -- admin only
* ``PATCH  /attributes/<id>/``   -- admin only
* ``DELETE /attributes/<id>/``   -- admin only

All responses use the standard envelope defined in
:mod:`apps.common.response`.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import (
    ListAPIView,
    RetrieveAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.pagination import StandardResultsPagination
from apps.common.permissions import IsAdmin
from apps.common.response import APIResponse, api_response
from apps.compatibility.models import (
    PCBuild,
    PCBuildItem,
    PCBuildSlot,
    CompatibilityAttribute,
    CompatibilityRule,
)
from apps.compatibility.serializers import (
    CompatibilityAttributeSerializer,
    CompatibilityRuleSerializer,
    CompatibilityCheckRequestSerializer,
    CompatibilityCheckResponseSerializer,
    PCBuildReadSerializer,
    PCBuildWriteSerializer,
)
from apps.compatibility.services import CompatibilityService
from apps.products.models import Product


# ====================================================================
# Rules + Attributes (admin)
# ====================================================================
class _AdminOnlyMixin:
    permission_classes = [IsAdmin]


class CompatibilityAttributeListCreateView(_AdminOnlyMixin, ListCreateAPIView):
    queryset = (
        CompatibilityAttribute.objects.all()
        .order_by("name")
    )
    serializer_class = CompatibilityAttributeSerializer
    pagination_class = StandardResultsPagination


class CompatibilityAttributeDetailView(_AdminOnlyMixin, RetrieveUpdateDestroyAPIView):
    queryset = CompatibilityAttribute.objects.all()
    serializer_class = CompatibilityAttributeSerializer
    lookup_field = "pk"


class RuleListCreateView(_AdminOnlyMixin, ListCreateAPIView):
    queryset = (
        CompatibilityRule.objects.all()
        .select_related("category_a", "category_b", "attribute_a", "attribute_b")
        .order_by("rule_name")
    )
    serializer_class = CompatibilityRuleSerializer
    pagination_class = StandardResultsPagination


class RuleDetailView(_AdminOnlyMixin, RetrieveUpdateDestroyAPIView):
    queryset = (
        CompatibilityRule.objects.all()
        .select_related("category_a", "category_b", "attribute_a", "attribute_b")
    )
    serializer_class = CompatibilityRuleSerializer
    lookup_field = "pk"


# ====================================================================
# Public compatibility check
# ====================================================================
class CompatibilityCheckView(APIView):
    """``POST /check/`` -- run the engine against an in-memory slot map.

    Used by the PC Builder for live updates without persisting. Returns
    the same ``{results, wattage, total_price}`` envelope as the build
    detail response so the frontend can share a reducer.
    """

    permission_classes = [AllowAny]

    @staticmethod
    def _load_products(slot_ids: dict[str, str]) -> dict:
        """Bulk-fetch the products referenced by ``slot_ids``.

        Returns a ``{product_id: Product}`` dict; missing IDs are silently
        dropped so the engine treats them as empty slots.
        """
        ids = [pid for pid in slot_ids.values() if pid]
        if not ids:
            return {}
        return {str(p.id): p for p in Product.objects.filter(id__in=ids)}

    def post(self, request, *args, **kwargs):
        req = CompatibilityCheckRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        slot_ids = req.validated_data["slots"]

        products = self._load_products(slot_ids)
        slot_map = {
            slot_key: products.get(slot_id)
            for slot_key, slot_id in slot_ids.items()
        }

        results = CompatibilityService.check_build(slot_map)
        wattage = CompatibilityService.compute_wattage_summary(slot_map)
        total_price = sum(
            (p.effective_price for p in slot_map.values() if p is not None),
            start=Decimal("0"),
        )

        body = {
            "results": [r.as_dict() for r in results],
            "wattage": wattage,
            "total_price": str(total_price),
        }
        payload = CompatibilityCheckResponseSerializer(body).data
        return api_response(data=payload)


# ====================================================================
# Compatible products for a slot
# ====================================================================
class CompatibleProductsView(ListAPIView):
    """``GET /products/<slot>/`` -- list products that fit a build.

    Slot is one of the 11 ``PCBuildSlot`` values.

    Per spec §2.10, the request takes one query key per already-filled
    slot, named after the slot::

        GET /products/CPU/?cpu_id=...&mobo_id=...&gpu_id=...&psu_id=...
        GET /products/CASE/?cpu_id=...&mobo_id=...&case_id=...
        ...

    The full set of accepted keys is ``cpu_id, mobo_id, ram1_id,
    ram2_id, gpu_id, psu_id, case_id, cooler_id, ssd1_id, ssd2_id,
    hdd_id`` plus an optional ``search`` substring on product /
    brand name. A legacy ``?selected=<slot>:<product_id>`` form is
    also accepted for back-compat.
    """

    permission_classes = [AllowAny]
    pagination_class = StandardResultsPagination

    # Spec §2.10 — slot-key → query-key translation. The frontend uses
    # the slot-key form to build the request; we translate it here.
    SLOT_QUERY_KEYS = {
        PCBuildSlot.CPU: "cpu_id",
        PCBuildSlot.MOBO: "mobo_id",
        PCBuildSlot.RAM_1: "ram1_id",
        PCBuildSlot.RAM_2: "ram2_id",
        PCBuildSlot.GPU: "gpu_id",
        PCBuildSlot.PSU: "psu_id",
        PCBuildSlot.CASE: "case_id",
        PCBuildSlot.COOLER: "cooler_id",
        PCBuildSlot.SSD_1: "ssd1_id",
        PCBuildSlot.SSD_2: "ssd2_id",
        PCBuildSlot.HDD: "hdd_id",
    }

    def get_serializer_class(self):
        from apps.products.serializers import ProductListSerializer

        return ProductListSerializer

    def get_queryset(self):
        slot_key = self.kwargs["slot"].upper()
        valid_slots = {key for key, _ in PCBuildSlot.choices}
        if slot_key not in valid_slots:
            raise ValidationError(
                "Unknown slot: %s. Valid slots: %s" % (slot_key, sorted(valid_slots))
            )

        selected = self._parse_selected()
        search = self.request.query_params.get("search") or None
        return CompatibilityService.get_compatible_products(
            slot_key, selected, search=search,
        )

    def _parse_selected(self) -> dict:
        """Build a ``{slot_key: Product|None}`` map from the request.

        Accepts both the spec form (``?cpu_id=&mobo_id=...``) and the
        legacy generic form (``?selected=SLOT:UUID``). The legacy form
        takes precedence if both are present so admin scripts that
        already use it keep working.
        """
        ids_by_slot: dict[str, str] = {}

        # 1. Legacy ``?selected=<slot>:<product_id>``
        for entry in self.request.query_params.getlist("selected"):
            if ":" not in entry:
                continue
            slot_part, product_part = entry.split(":", 1)
            slot_key = slot_part.strip().upper()
            pid = product_part.strip()
            if slot_key and pid:
                ids_by_slot[slot_key] = pid

        # 2. Spec form ``?<slot>_id=...``
        for slot_key, query_key in self.SLOT_QUERY_KEYS.items():
            value = self.request.query_params.get(query_key)
            if value:
                ids_by_slot[slot_key] = value.strip()

        if not ids_by_slot:
            return {}
        products = {
            str(p.pk): p
            for p in Product.objects.filter(pk__in=ids_by_slot.values())
        }
        return {
            slot_key: products.get(pid)
            for slot_key, pid in ids_by_slot.items()
        }


# ====================================================================
# Builds (user-owned)
# ====================================================================
def _resolve_slot_map(slots_payload: dict | None) -> tuple[dict, Decimal]:
    """Translate ``{slot: product_id}`` into ``{slot: Product}`` + total price."""
    if not slots_payload:
        return {}, Decimal("0")
    valid_slots = {key for key, _ in PCBuildSlot.choices}
    product_ids = set()
    for slot_key, slot_value in slots_payload.items():
        if slot_key not in valid_slots:
            raise ValidationError({"slots": "Unknown slot: %s" % slot_key})
        pid = slot_value.get("product_id") if isinstance(slot_value, dict) else None
        if pid:
            product_ids.add(str(pid))
    products = {
        str(p.pk): p for p in Product.objects.filter(pk__in=product_ids)
    }
    slot_map: dict[str, Product | None] = {}
    total = Decimal("0")
    for slot_key, slot_value in slots_payload.items():
        pid = slot_value.get("product_id") if isinstance(slot_value, dict) else None
        product = products.get(str(pid)) if pid else None
        slot_map[slot_key] = product
        if product is not None:
            total += product.effective_price
    return slot_map, total


def _persist_slot_items(build: PCBuild, slot_map: dict[str, Product | None]) -> None:
    """Replace build items atomically with the supplied slot map.

    Slots whose product is ``None`` are kept as empty rows so the
    unique constraint on ``(build, slot)`` stays intact across edits.
    """
    with transaction.atomic():
        existing = {it.slot: it for it in build.items.all()}
        keep_slots = set()
        for slot_key, product in slot_map.items():
            it = existing.get(slot_key)
            if it is None:
                PCBuildItem.objects.create(
                    build=build,
                    slot=slot_key,
                    product=product,
                )
            else:
                it.product = product
                it.save(update_fields=["product", "updated_at"])
            keep_slots.add(slot_key)
        # Remove items no longer referenced by the payload.
        for slot_key, it in existing.items():
            if slot_key not in keep_slots:
                it.delete()


class PCBuildListCreateView(APIView):
    """List (GET) or create (POST) PC builds for the authenticated user."""

    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get(self, request, *args, **kwargs):
        queryset = (
            PCBuild.objects.filter(user=request.user)
            .prefetch_related(Prefetch("items", queryset=PCBuildItem.objects.select_related("product")))
            .order_by("-updated_at")
        )
        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PCBuildReadSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, *args, **kwargs):
        serializer = PCBuildWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        slot_map, total = _resolve_slot_map(serializer.validated_data.get("slots"))

        build = PCBuild.objects.create(
            user=request.user,
            name=serializer.validated_data["name"],
            is_public=serializer.validated_data.get("is_public", False),
            total_price=total,
        )
        _persist_slot_items(build, slot_map)
        return api_response(
            data=PCBuildReadSerializer(build, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class PCBuildDetailView(APIView):
    """Retrieve (GET), update (PATCH), or delete (DELETE) a single build."""

    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        build = get_object_or_404(
            PCBuild.objects.prefetch_related(
                Prefetch("items", queryset=PCBuildItem.objects.select_related("product"))
            ),
            pk=pk,
        )
        if build.user_id != request.user.id and not request.user.is_staff:
            raise PermissionDenied("Not the owner of this build.")
        return build

    def get(self, request, *args, **kwargs):
        build = self.get_object(request, kwargs["pk"])
        return api_response(
            data=PCBuildReadSerializer(build, context={"request": request}).data,
        )

    def patch(self, request, *args, **kwargs):
        build = self.get_object(request, kwargs["pk"])
        serializer = PCBuildWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if "name" in serializer.validated_data:
            build.name = serializer.validated_data["name"]
        if "is_public" in serializer.validated_data:
            build.is_public = serializer.validated_data["is_public"]
        if "slots" in serializer.validated_data:
            slot_map, total = _resolve_slot_map(serializer.validated_data["slots"])
            build.total_price = total
            build.save()
            _persist_slot_items(build, slot_map)
        else:
            build.save()
        return api_response(
            data=PCBuildReadSerializer(build, context={"request": request}).data,
        )

    def delete(self, request, *args, **kwargs):
        build = self.get_object(request, kwargs["pk"])
        build.delete()  # soft-delete via TimeStampedModel
        return api_response(data={"id": str(build.pk)}, message="Build deleted.")


class SharedPCBuildView(RetrieveAPIView):
    """``GET /builds/share/<token>/`` -- public when ``is_public=True``.

    Owners and staff can always view their own build regardless of
    the public flag.
    """

    permission_classes = [AllowAny]
    serializer_class = PCBuildReadSerializer
    lookup_field = "share_token"
    lookup_url_kwarg = "token"

    def get_queryset(self):
        return (
            PCBuild.objects.filter(is_active=True)
            .prefetch_related(
                Prefetch("items", queryset=PCBuildItem.objects.select_related("product"))
            )
        )

    def retrieve(self, request, *args, **kwargs):
        build = self.get_object()
        if not build.is_public:
            if not request.user.is_authenticated or (
                build.user_id != request.user.id and not request.user.is_staff
            ):
                raise PermissionDenied("Build is private.")
        return api_response(
            data=self.get_serializer(build).data,
        )
