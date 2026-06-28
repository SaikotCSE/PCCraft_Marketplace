"""Smoke test for Module 8 — PC Builder & Compatibility.

Validates the contract defined in ``PCCraft_Master_Spec_v4.md`` §2.10:

* POST /api/v1/compatibility/check/  -- spec-shaped result rows
  ({rule_name, status, message, category_a, category_b}), INFO rows
  appear when a required slot is unfilled, wattage payload uses the
  spec §2.10 formula.
* GET  /api/v1/compatibility/products/<slot>/  -- accepts both the
  spec ``?cpu_id=&mobo_id=...`` form and the legacy ``?selected=`` form.
* POST /api/v1/builds/   -- spec §2.10 "On login: auto-POST" alias.
* GET  /api/v1/builds/<id>/
* GET  /api/v1/builds/share/<token>/

Run from backend/ with the conda env active:
    python scripts/_smoke_module8.py
"""
from __future__ import annotations

import json
import os
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from decimal import Decimal  # noqa: E402

from django.contrib.auth import get_user_model  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from apps.brands.models import Brand  # noqa: E402
from apps.categories.models import Category  # noqa: E402
from apps.products.models import Product, ProductStatus  # noqa: E402

User = get_user_model()

TAG = "[module8-smoke]"

# Spec §2.10 valid result statuses.
VALID_STATUSES = {"OK", "WARNING", "ERROR", "INFO"}
REQUIRED_ROW_KEYS = {"rule_name", "status", "message", "category_a", "category_b"}


def _ensure_brand(slug: str, name: str) -> Brand:
    b, _ = Brand.objects.get_or_create(slug=slug, defaults={"name": name, "is_active": True})
    return b


def _ensure_product(*, slug: str, category_slug: str, brand: Brand, specs: dict, price: Decimal, vendor) -> Product:
    cat = Category.objects.get(slug=category_slug)
    p, _ = Product.objects.update_or_create(
        slug=slug,
        defaults={
            "name": slug.replace("-", " ").title(),
            "category": cat,
            "brand": brand,
            "vendor": vendor,
            "specs": specs,
            "base_price": price,
            "stock_quantity": 5,
            "sku": "SMK-" + slug.upper()[:16],
            "status": ProductStatus.ACTIVE,
            "is_active": True,
        },
    )
    return p


def _ensure_user(email: str = "smoke-module8@pccraft.local", full_name: str = "Smoke Module 8") -> "User":
    u, _ = User.objects.get_or_create(
        email=email,
        defaults={"full_name": full_name, "is_active": True},
    )
    u.set_password("test12345")
    u.save()
    return u


def _assert_row_shape(rows: list) -> None:
    """Every row must have the spec §2.10 keys and a valid status."""
    for r in rows:
        assert REQUIRED_ROW_KEYS.issubset(r.keys()), (
            "Missing spec keys in row %s; have %s" % (r.get("rule_name"), sorted(r.keys()))
        )
        # No drift keys leaked into the wire shape.
        assert set(r.keys()) == REQUIRED_ROW_KEYS, (
            "Unexpected keys leaked from row %s: %s" % (r.get("rule_name"), sorted(set(r.keys()) - REQUIRED_ROW_KEYS))
        )
        assert r["status"] in VALID_STATUSES, (
            "Row %s has invalid status %s" % (r["rule_name"], r["status"])
        )
        assert r["message"], "Row %s has empty message" % r["rule_name"]
        assert r["category_a"], "Row %s has empty category_a" % r["rule_name"]
        assert r["category_b"], "Row %s has empty category_b" % r["rule_name"]


def main() -> int:
    # ---- 1. Seed minimal product set ----
    b_amd = _ensure_brand("smoke-amd", "Smoke AMD")
    b_intel = _ensure_brand("smoke-intel", "Smoke Intel")
    b_corsair = _ensure_brand("smoke-corsair", "Smoke Corsair")
    b_nzxt = _ensure_brand("smoke-nzxt", "Smoke NZXT")
    b_seasonic = _ensure_brand("smoke-seasonic", "Smoke Seasonic")

    user = _ensure_user()
    from apps.accounts.models import VendorProfile, VendorStatus
    from django.core.files.uploadedfile import SimpleUploadedFile

    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
        b"2 0 obj <</Type /Pages /Count 0>> endobj\n"
        b"xref\n0 3\n0000000000 65535 f \n"
        b"0000000009 00000 n \n0000000056 00000 n \n"
        b"trailer <</Size 3 /Root 1 0 R>>\nstartxref\n100\n%%EOF\n"
    )
    trade_doc = SimpleUploadedFile("trade_license.pdf", pdf_bytes, content_type="application/pdf")
    nid_doc = SimpleUploadedFile("nid.pdf", pdf_bytes, content_type="application/pdf")

    vendor, _ = VendorProfile.objects.get_or_create(
        store_name="Smoke Vendor",
        defaults={
            "user": user,
            "business_name": "Smoke Vendor Ltd",
            "owner_name": user.full_name or "Smoke Owner",
            "trade_license_number": "SMK-LIC-0001",
            "trade_license_doc": trade_doc,
            "nid_number": "SMK-NID-0001",
            "nid_doc": nid_doc,
            "store_slug": "smoke-vendor",
            "store_contact_email": user.email,
            "status": VendorStatus.APPROVED,
        },
    )

    cpu = _ensure_product(
        slug="smoke-cpu-amd-7800x3d",
        category_slug="cpus",
        brand=b_amd,
        specs={"socket": "AM5", "tdp": 120, "generation": "DDR5"},
        price=Decimal("399.00"),
        vendor=vendor,
    )
    mobo = _ensure_product(
        slug="smoke-mobo-am5",
        category_slug="motherboards",
        brand=b_amd,
        specs={"socket": "AM5", "form_factor": "ATX", "generation": "DDR5", "supported_interfaces": ["M.2 NVMe", "SATA"]},
        price=Decimal("229.00"),
        vendor=vendor,
    )
    ram = _ensure_product(
        slug="smoke-ram-ddr5",
        category_slug="ram",
        brand=b_corsair,
        specs={"generation": "DDR5"},
        price=Decimal("119.00"),
        vendor=vendor,
    )
    gpu = _ensure_product(
        slug="smoke-gpu-rtx4070",
        category_slug="gpus",
        brand=b_intel,
        specs={"tdp": 200, "gpu_length_mm": 285},
        price=Decimal("599.00"),
        vendor=vendor,
    )
    case = _ensure_product(
        slug="smoke-case-nzxt-h7",
        category_slug="pc-cases",
        brand=b_nzxt,
        specs={"supported_form_factors": ["ATX", "mATX"], "max_gpu_length_mm": 400, "max_cooler_height_mm": 185},
        price=Decimal("149.00"),
        vendor=vendor,
    )
    cooler = _ensure_product(
        slug="smoke-cooler-am5",
        category_slug="cpu-coolers",
        brand=b_nzxt,
        specs={"cooler_height_mm": 165, "cooler_socket_support": ["AM5", "AM4"]},
        price=Decimal("89.00"),
        vendor=vendor,
    )
    psu = _ensure_product(
        slug="smoke-psu-650w",
        category_slug="power-supplies",
        brand=b_seasonic,
        specs={"wattage": 650},
        price=Decimal("99.00"),
        vendor=vendor,
    )
    ssd = _ensure_product(
        slug="smoke-ssd-nvme",
        category_slug="ssd",
        brand=b_corsair,
        specs={"interface": "M.2 NVMe"},
        price=Decimal("89.00"),
        vendor=vendor,
    )
    print(f"{TAG} seeded {Product.objects.filter(slug__startswith='smoke-').count()} fixture products")

    # SERVER_NAME is set so Django's CommonMiddleware accepts the Host header
    # (ALLOWED_HOSTS is restricted to localhost / 127.0.0.1 in dev).
    client = APIClient(SERVER_NAME="localhost")

    # ---- 2. Positive check: every filled pair passes ----
    payload = {
        "slots": {
            "CPU": str(cpu.id),
            "MOBO": str(mobo.id),
            "RAM_1": str(ram.id),
            "GPU": str(gpu.id),
            "CASE": str(case.id),
            "COOLER": str(cooler.id),
            "PSU": str(psu.id),
            "SSD_1": str(ssd.id),
        }
    }
    r = client.post("/api/v1/compatibility/check/", payload, format="json")
    assert r.status_code == 200, f"check positive failed: {r.status_code} {r.content!r}"
    body = r.json()
    data = body["data"]
    print(f"{TAG} check positive — success={body.get('success')} results={len(data['results'])}")
    print(json.dumps(data, indent=2)[:1500])
    _assert_row_shape(data["results"])
    statuses = [res["status"] for res in data["results"]]
    # POWER_CHECK must pass: estimated = 120 + 200 + (50 + 5 + 5 + 0) = 380W;
    # PSU 650W × 0.80 = 520W headroom → 380 ≤ 520 → OK.
    assert all(s in ("OK", "INFO") for s in statuses), statuses
    assert any("Power" in r["rule_name"] or "GPU" in r["rule_name"] for r in data["results"])
    # Wattage payload sanity (spec §2.10).
    wattage = data["wattage"]
    assert wattage["status"] in ("ok", "warning", "error", "none"), wattage
    assert wattage["estimated_tdp"] is not None
    expected_estimated = Decimal("120") + Decimal("200") + Decimal("50") + Decimal("5") + Decimal("5")  # CPU+GPU+base+RAM1+SSD1
    assert Decimal(wattage["estimated_tdp"]) == expected_estimated, (
        "estimated_tdp = %s, expected %s" % (wattage["estimated_tdp"], expected_estimated)
    )
    assert Decimal(wattage["psu_wattage"]) == Decimal("650")
    # 650W × 0.80 = 520W headroom; estimated 380 ≤ 520×0.70=364? No, 380 > 364 → warning.
    assert wattage["status"] == "warning", wattage["status"]
    assert "Estimated Load" in wattage["message"]

    # ---- 3. Negative case — GPU too long for case (small case) ----
    small_case = _ensure_product(
        slug="smoke-case-tiny",
        category_slug="pc-cases",
        brand=b_nzxt,
        specs={"supported_form_factors": ["Mini-ITX"], "max_gpu_length_mm": 200, "max_cooler_height_mm": 100},
        price=Decimal("79.00"),
        vendor=vendor,
    )
    r2 = client.post("/api/v1/compatibility/check/", {"slots": {
        "CPU": str(cpu.id), "MOBO": str(mobo.id), "RAM_1": str(ram.id),
        "GPU": str(gpu.id), "CASE": str(small_case.id),
        "COOLER": str(cooler.id), "PSU": str(psu.id), "SSD_1": str(ssd.id),
    }}, format="json")
    assert r2.status_code == 200, r2.content
    body2 = r2.json()
    _assert_row_shape(body2["data"]["results"])
    # Find the GPU-vs-case rule — its category pair is GPU/CASE.
    gpu_case_rule = next(
        (r for r in body2["data"]["results"]
         if {r["category_a"].lower(), r["category_b"].lower()} == {"gpu", "pc case"}
         or {r["category_a"].lower(), r["category_b"].lower()} == {"gpu", "pc case"}),
        None,
    )
    # Fallback to any GPU row + CASE row — pick the rule whose category_a or b is "GPU"
    # and the other is "PC Case".
    if gpu_case_rule is None:
        gpu_case_rule = next(
            (r for r in body2["data"]["results"]
             if "gpu" in r["category_a"].lower() and "case" in r["category_b"].lower())
            or (r for r in body2["data"]["results"]
                if "gpu" in r["category_b"].lower() and "case" in r["category_a"].lower()),
            None,
        )
    # Find the GPU-vs-case rule by category pair (PC Cases ↔ GPUs).
    pair = {s.lower() for s in ("PC Cases", "GPUs")}
    gpu_case_rule = next(
        (r for r in body2["data"]["results"]
         if {r["category_a"].lower(), r["category_b"].lower()} == pair),
        None,
    )
    print(f"{TAG} check negative — gpu/case rule status=%s" % (gpu_case_rule and gpu_case_rule["status"]))
    assert gpu_case_rule is not None, "expected a GPU ↔ CASE rule in the result rows"
    assert gpu_case_rule["status"] == "ERROR", gpu_case_rule

    # ---- 4. INFO rows appear when a required slot is empty ----
    info_payload = {"slots": {"CPU": str(cpu.id), "MOBO": str(mobo.id)}}  # no PSU/COOLER/etc.
    r_info = client.post("/api/v1/compatibility/check/", info_payload, format="json")
    assert r_info.status_code == 200, r_info.content
    info_rows = r_info.json()["data"]["results"]
    _assert_row_shape(info_rows)
    info_count = sum(1 for r in info_rows if r["status"] == "INFO")
    print(f"{TAG} partial build — info rows=%d / total=%d" % (info_count, len(info_rows)))
    assert info_count >= 1, "expected at least one INFO row when many slots are empty"

    # ---- 5. Compatible products for slot CPU (spec §2.10 query keys) ----
    r3 = client.get(
        "/api/v1/compatibility/products/CPU/?cpu_id=" + str(cpu.id) + "&mobo_id=" + str(mobo.id)
    )
    assert r3.status_code == 200, r3.content
    data3 = r3.json()
    slugs = [p["slug"] for p in data3["data"]]
    print(f"{TAG} compatible CPUs (?cpu_id&mobo_id) — count=%d" % len(slugs))
    assert "smoke-cpu-amd-7800x3d" in slugs, slugs
    # Legacy form must still work.
    r3_legacy = client.get("/api/v1/compatibility/products/CPU/?selected=MOBO:" + str(mobo.id))
    assert r3_legacy.status_code == 200, r3_legacy.content
    legacy_slugs = [p["slug"] for p in r3_legacy.json()["data"]]
    assert "smoke-cpu-amd-7800x3d" in legacy_slugs, legacy_slugs
    # Spec form must also accept <slot>=<uuid> form so the "select RAM_2 first" call works.
    r3_ram = client.get("/api/v1/compatibility/products/RAM_1/?cpu_id=" + str(cpu.id) + "&mobo_id=" + str(mobo.id))
    assert r3_ram.status_code == 200, r3_ram.content

    # ---- 6. /api/v1/builds/ alias (spec §2.10 "On login: auto-POST") ----
    user = _ensure_user()
    client.force_authenticate(user=user)
    create_payload = {
        "name": "Smoke Build",
        "slots": {
            "CPU": str(cpu.id), "MOBO": str(mobo.id), "RAM_1": str(ram.id),
            "GPU": str(gpu.id), "CASE": str(case.id), "COOLER": str(cooler.id),
            "PSU": str(psu.id), "SSD_1": str(ssd.id),
        },
        "is_public": True,
    }
    # Both the canonical alias and the legacy /compatibility/ prefix must succeed.
    r4 = client.post("/api/v1/builds/", create_payload, format="json")
    assert r4.status_code == 201, f"create build via /api/v1/builds/ failed: {r4.status_code} {r4.content!r}"
    build_id = r4.json()["data"]["id"]
    share_token = r4.json()["data"]["share_token"]
    print(f"{TAG} created build id=%s share_token=%s… via /api/v1/builds/" % (build_id, share_token[:8]))

    # Same on the legacy prefix.
    r4_legacy = client.post("/api/v1/compatibility/builds/", create_payload, format="json")
    assert r4_legacy.status_code == 201, r4_legacy.content
    legacy_build_id = r4_legacy.json()["data"]["id"]
    print(f"{TAG} same POST works on legacy /compatibility/builds/ id=%s" % legacy_build_id)

    r5 = client.get("/api/v1/builds/%d/" % build_id)
    assert r5.status_code == 200, r5.content
    build_body = r5.json()["data"]
    slots = build_body["slots"]
    print(f"{TAG} read build — populated slots=%d/11" % sum(1 for v in slots.values() if v))
    assert slots["CPU"]["id"] == str(cpu.id)
    # Embedded compatibility rows must conform to spec shape too.
    embedded = build_body.get("compatibility_results", [])
    _assert_row_shape(embedded)
    # Embedded wattage must use spec formula.
    embedded_wattage = build_body.get("wattage", {})
    assert embedded_wattage.get("estimated_tdp") is not None
    assert Decimal(embedded_wattage["estimated_tdp"]) == expected_estimated, embedded_wattage

    # ---- 7. Anonymous can read shared build ----
    anon = APIClient(SERVER_NAME="localhost")
    r6 = anon.get(f"/api/v1/builds/share/{share_token}/")
    assert r6.status_code == 200, r6.content
    assert r6.json()["data"]["share_token"] == share_token

    # ---- 8. Other user cannot read private build ----
    other = _ensure_user(email="smoke-module8-other@pccraft.local", full_name="Smoke Other")
    other_client = APIClient(SERVER_NAME="localhost")
    other_client.force_authenticate(user=other)
    r7 = other_client.get(f"/api/v1/builds/{build_id}/")
    assert r7.status_code in (403, 404), f"other user should not read private build, got {r7.status_code}"

    print(f"{TAG} ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())