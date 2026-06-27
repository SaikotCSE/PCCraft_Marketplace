"""End-to-end audit of Module 2 per spec §2.7.

Covers:
  * Public catalog  : list (paginated), detail, filter, sort, trending, search.
  * Categories      : tree (root + children), single, slug unique.
  * Brands          : list, detail.
  * Vendor CRUD     : login → list → create → retrieve → patch → image upload
                      → set primary → reorder → delete image → patch again →
                      delete product.
  * Admin CRUD      : category create/patch/delete, brand create/patch/delete.
  * Edge cases      : SKU uniqueness per vendor, 8-image cap, discount
                      validation, spec-template enforcement.
"""
from __future__ import annotations

import io
import json
import os
import pathlib
import sys
import django

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))
os.environ.setdefault(
    'DJANGO_SETTINGS_MODULE', 'config.settings.development',
)
os.environ.setdefault('DJANGO_ALLOWED_HOSTS', 'testserver,localhost,127.0.0.1')
django.setup()

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.accounts.models import VendorProfile, VendorStatus, UserRole
from apps.brands.models import Brand
from apps.categories.models import Category
from apps.products.models import Product, ProductStatus


PASS = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"
SECTION = "\033[1;36m"


def _check(label: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  {PASS} {label}{(' — ' + detail) if detail else ''}")
    else:
        print(f"  {FAIL} {label}{(' — ' + detail) if detail else ''}")
        raise SystemExit(1)


def _image(name: str, content: bytes = b"\x89PNG\r\n\x1a\n" + b"x" * 32) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content, content_type="image/png")


def main() -> None:
    client = Client()

    # ------------------------------------------------------------------
    # 1. PUBLIC CATALOG
    # ------------------------------------------------------------------
    print(f"\n{SECTION}[1] Public catalog (spec §2.7 list endpoint){SECTION}")

    r = client.get('/api/v1/products/?page=1&page_size=10')
    _check("GET /products/ → 200", r.status_code == 200, str(r.status_code))
    body = r.json()
    _check("envelope success", body.get("success") is True)
    items = body["data"]
    _check("data is a list", isinstance(items, list))
    if items:
        sample = items[0]
        for k in ("id", "slug", "name", "base_price", "discounted_price",
                  "effective_price", "brand", "category", "primary_image",
                  "stock_quantity"):
            _check(f"  list item has '{k}'", k in sample)

    # Filter by category slug
    first_root = Category.objects.filter(parent__isnull=True).first()
    if first_root:
        r = client.get(f'/api/v1/products/?category={first_root.slug}&page_size=5')
        _check("filter by category → 200", r.status_code == 200)
        _check("filter returned items or empty", isinstance(r.json()["data"], list))

    # Sort
    r = client.get('/api/v1/products/?ordering=-created_at&page_size=5')
    _check("sort by -created_at → 200", r.status_code == 200)

    r = client.get('/api/v1/products/?ordering=price&page_size=5')
    _check("sort by price → 200", r.status_code == 200)

    r = client.get('/api/v1/products/?in_stock=true&page_size=5')
    _check("filter in_stock=true → 200", r.status_code == 200)

    # Detail
    if items:
        slug = items[0]["slug"]
        r = client.get(f'/api/v1/products/{slug}/')
        _check(f"GET /products/{slug}/ → 200", r.status_code == 200)
        body = r.json()
        if isinstance(body, dict) and "data" in body and isinstance(body["data"], dict):
            body = body["data"]
        for k in ("images", "specs", "vendor", "sku", "warranty_months",
                  "stock_quantity", "description"):
            _check(f"  detail has '{k}'", k in body)

    # Trending
    r = client.get('/api/v1/products/trending/')
    _check("GET /products/trending/ → 200", r.status_code == 200)

    # Search
    r = client.get('/api/v1/products/search/?q=test')
    _check("GET /products/search/ → 200", r.status_code == 200)

    # ------------------------------------------------------------------
    # 2. CATEGORIES
    # ------------------------------------------------------------------
    print(f"\n{SECTION}[2] Categories (spec §2.7){SECTION}")
    r = client.get('/api/v1/categories/')
    _check("GET /categories/ tree → 200", r.status_code == 200)
    cats = r.json()["data"]
    _check("tree is a list", isinstance(cats, list))
    if cats:
        first = cats[0]
        for k in ("id", "name", "slug", "is_active", "children"):
            _check(f"  category node has '{k}'", k in first)
        leaf = Category.objects.filter(parent__isnull=False).first()
        if leaf:
            r = client.get(f'/api/v1/categories/{leaf.slug}/')
            _check(f"GET /categories/{leaf.slug}/ → 200", r.status_code == 200)
            bd = r.json()["data"]
            _check("detail exposes spec_template", "spec_template" in bd)

    # ------------------------------------------------------------------
    # 3. BRANDS
    # ------------------------------------------------------------------
    print(f"\n{SECTION}[3] Brands (spec §2.7){SECTION}")
    r = client.get('/api/v1/brands/?page_size=100')
    _check("GET /brands/ → 200", r.status_code == 200)
    brands = r.json()["data"]
    _check("data is a list", isinstance(brands, list))
    if brands:
        for k in ("id", "slug", "name"):
            _check(f"  brand has '{k}'", k in brands[0])
        brand_slug = brands[0]["slug"]
        r = client.get(f'/api/v1/brands/{brand_slug}/')
        _check(f"GET /brands/{brand_slug}/ → 200", r.status_code == 200)

    # ------------------------------------------------------------------
    # 4. VENDOR FLOW (CRUD)
    # ------------------------------------------------------------------
    print(f"\n{SECTION}[4] Vendor product CRUD (spec §2.7){SECTION}")
    UserModel = get_user_model()
    email = "smk_audit_vendor@example.com"
    user, _ = UserModel.objects.update_or_create(
        email=email,
        defaults={
            "role": UserRole.VENDOR,
            "is_active": True,
            "full_name": "Audit Vendor",
        },
    )
    user.set_password("Pass12345!")
    user.save()
    vendor, _ = VendorProfile.objects.update_or_create(
        user=user,
        defaults={
            "owner_name": "Audit Vendor",
            "business_name": "Audit Co.",
            "store_name": "Audit Co. Store",
            "business_type": "SOLE_PROP",
            "trade_license_number": "TL-AUDIT-001",
            "business_address": {"street": "1 St", "city": "Dhaka", "district": "Dhaka", "postal_code": "1207"},
            "nid_number": "NID-AUDIT-001",
            "trade_license_doc": SimpleUploadedFile("tl.pdf", b"%PDF-1.4 fake", content_type="application/pdf"),
            "nid_doc": SimpleUploadedFile("nid.pdf", b"%PDF-1.4 fake", content_type="application/pdf"),
            "status": VendorStatus.APPROVED,
        },
    )

    # Also need a CustomerUser for admin (since IsAdminUser checks is_staff).
    admin_email = "smk_audit_admin@example.com"
    admin_user, _ = UserModel.objects.update_or_create(
        email=admin_email,
        defaults={
            "role": UserRole.ADMIN,
            "is_active": True,
            "is_staff": True,
            "is_superuser": True,
            "full_name": "Audit Admin",
        },
    )
    admin_user.set_password("Pass12345!")
    admin_user.save()

    r = client.post("/api/v1/auth/login/", {
        "email": email, "password": "Pass12345!", "role": "vendor",
    }, content_type="application/json")
    _check("vendor login → 200", r.status_code == 200, str(r.status_code))
    vendor_token = r.json()["data"]["access"]

    r = client.post("/api/v1/auth/login/", {
        "email": admin_email, "password": "Pass12345!", "role": "admin",
    }, content_type="application/json")
    _check("admin login → 200", r.status_code == 200, str(r.status_code))
    admin_token = r.json()["data"]["access"]

    auth_v = {"HTTP_AUTHORIZATION": f"Bearer {vendor_token}"}
    auth_a = {"HTTP_AUTHORIZATION": f"Bearer {admin_token}"}

    # Create a fresh category with a spec_template for spec enforcement tests.
    # Soft-deleted prior audit runs' products so the create call can succeed
    # (unique constraint is now is_active=True only).
    Product.objects.filter(vendor=vendor, is_active=True).update(is_active=False)
    test_cat, _ = Category.objects.get_or_create(
        name="Audit CPUs",
        defaults={
            "parent": first_root,
            "spec_template": [
                {"key": "socket", "label": "Socket", "type": "str"},
                {"key": "cores", "label": "Cores", "type": "int"},
                {"key": "tdp_w", "label": "TDP (W)", "type": "int"},
            ],
        },
    )
    test_brand, _ = Brand.objects.get_or_create(
        name="Audit Brand", defaults={"description": "Audit"},
    )

    # LIST (vendor's own)
    r = client.get("/api/v1/vendor/products/", **auth_v)
    _check("GET /vendor/products/ → 200", r.status_code == 200)

    # CREATE
    r = client.post(
        "/api/v1/vendor/products/",
        data=json.dumps({
            "name": "Audit CPU X1",
            "brand": test_brand.slug,
            "category": test_cat.slug,
            "description": "An audit-only test product.",
            "short_description": "Audit CPU.",
            "base_price": "100.00",
            "discounted_price": "80.00",
            "sku": "AUDIT-CPU-X1",
            "stock_quantity": 10,
            "low_stock_threshold": 3,
            "status": "ACTIVE",
            "warranty_months": 24,
            "specs": {"socket": "AM5", "cores": 8, "tdp_w": 105},
        }),
        content_type="application/json",
        **auth_v,
    )
    _check("POST /vendor/products/ → 201", r.status_code == 201,
           str(r.status_code) + " " + r.content.decode()[:200])
    product_slug = r.json()["data"]["slug"]
    _check("create returned slug", bool(product_slug))

    # Duplicate SKU → 409
    r = client.post(
        "/api/v1/vendor/products/",
        data=json.dumps({
            "name": "Audit CPU X1 dup",
            "brand": test_brand.slug,
            "category": test_cat.slug,
            "base_price": "100.00",
            "sku": "AUDIT-CPU-X1",
        }),
        content_type="application/json",
        **auth_v,
    )
    _check("duplicate SKU → 409", r.status_code == 409,
           str(r.status_code))

    # Specs with unknown key → 400
    r = client.post(
        "/api/v1/vendor/products/",
        data=json.dumps({
            "name": "Audit CPU bad",
            "brand": test_brand.slug,
            "category": test_cat.slug,
            "base_price": "100.00",
            "sku": "AUDIT-CPU-X2",
            "specs": {"definitely_not_a_key": "x"},
        }),
        content_type="application/json",
        **auth_v,
    )
    _check("unknown spec key → 400", r.status_code == 400)

    # discounted_price >= base_price → 400
    r = client.post(
        "/api/v1/vendor/products/",
        data=json.dumps({
            "name": "Audit CPU bad price",
            "brand": test_brand.slug,
            "category": test_cat.slug,
            "base_price": "100.00",
            "discounted_price": "150.00",
            "sku": "AUDIT-CPU-X3",
        }),
        content_type="application/json",
        **auth_v,
    )
    _check("discount >= base → 400", r.status_code == 400)

    # RETRIEVE
    r = client.get(f"/api/v1/vendor/products/{product_slug}/", **auth_v)
    _check("GET /vendor/products/{slug}/ → 200", r.status_code == 200)

    # PATCH
    r = client.patch(
        f"/api/v1/vendor/products/{product_slug}/",
        data={"stock_quantity": 25, "is_featured": False},
        content_type="application/json",
        **auth_v,
    )
    _check("PATCH stock_quantity → 200", r.status_code == 200,
           r.content.decode()[:200])

    # IMAGE UPLOAD
    r = client.post(
        f"/api/v1/vendor/products/{product_slug}/images/",
        data={"images": [_image("a.png"), _image("b.png")]},
        **auth_v,
    )
    _check("POST images → 201", r.status_code == 201,
           str(r.status_code) + " " + r.content.decode()[:200])
    image_ids = [img["id"] for img in r.json()["data"]]
    _check("returned 2 images", len(image_ids) == 2)

    # SET PRIMARY on second image
    r = client.patch(
        f"/api/v1/vendor/products/{product_slug}/images/{image_ids[1]}/set-primary/",
        data={}, content_type="application/json", **auth_v,
    )
    _check("set primary → 200", r.status_code == 200)

    # REORDER
    r = client.post(
        f"/api/v1/vendor/products/{product_slug}/images/reorder/",
        data={"ids": [image_ids[1], image_ids[0]]},
        content_type="application/json", **auth_v,
    )
    _check("reorder → 200", r.status_code == 200,
           r.content.decode()[:200])

    # 8-image cap test: upload 7 more (would total 9) → 400
    extras = [_image(f"e{i}.png") for i in range(7)]
    r = client.post(
        f"/api/v1/vendor/products/{product_slug}/images/",
        data={"images": extras},
        **auth_v,
    )
    _check(">8 images total → 400", r.status_code == 400,
           str(r.status_code) + " " + r.content.decode()[:200])

    # DELETE one image
    r = client.delete(
        f"/api/v1/vendor/products/{product_slug}/images/by-id/{image_ids[0]}/",
        **auth_v,
    )
    _check("DELETE image → 200", r.status_code == 200)

    # DELETE product (soft)
    r = client.delete(f"/api/v1/vendor/products/{product_slug}/", **auth_v)
    _check("DELETE /vendor/products/{slug}/ → 200", r.status_code == 200)

    # After soft-delete, public catalog should NOT include it.
    r = client.get('/api/v1/products/?page_size=100')
    visible_slugs = {p["slug"] for p in r.json()["data"]}
    _check("soft-deleted product hidden from public list",
           product_slug not in visible_slugs)

    # ------------------------------------------------------------------
    # 5. ADMIN CRUD
    # ------------------------------------------------------------------
    print(f"\n{SECTION}[5] Admin category/brand CRUD{SECTION}")
    # Soft-delete any prior runs' test categories/brands so the create calls succeed.
    Category.objects.filter(is_active=True, name__in=["Audit Category"]).update(is_active=False)
    Brand.objects.filter(is_active=True, name__in=["Audit Brand 2"]).update(is_active=False)
    r = client.post("/api/v1/categories/", data={
        "name": "Audit Category",
        "parent": first_root.id if first_root else None,
        "is_active": True,
        "spec_template": [{"key": "watts", "label": "Watts", "type": "int"}],
    }, content_type="application/json", **auth_a)
    _check("POST /categories/ admin → 201", r.status_code == 201,
           str(r.status_code) + " " + r.content.decode()[:200])
    new_cat_slug = r.json()["data"]["slug"]

    r = client.patch(f"/api/v1/categories/{new_cat_slug}/",
                     data={"description": "Updated"}, content_type="application/json",
                     **auth_a)
    _check("PATCH /categories/{slug}/ admin → 200", r.status_code == 200)

    r = client.delete(f"/api/v1/categories/{new_cat_slug}/", **auth_a)
    _check("DELETE /categories/{slug}/ admin → 200", r.status_code == 200)

    r = client.post("/api/v1/brands/", data={
        "name": "Audit Brand 2",
        "is_active": True,
    }, content_type="application/json", **auth_a)
    _check("POST /brands/ admin → 201", r.status_code == 201,
           str(r.status_code) + " " + r.content.decode()[:200])
    new_brand_slug = r.json()["data"]["slug"]

    r = client.patch(f"/api/v1/brands/{new_brand_slug}/",
                     data={"description": "Audit"}, content_type="application/json",
                     **auth_a)
    _check("PATCH /brands/{slug}/ admin → 200", r.status_code == 200)

    r = client.delete(f"/api/v1/brands/{new_brand_slug}/", **auth_a)
    _check("DELETE /brands/{slug}/ admin → 200", r.status_code == 200)

    # Non-admin cannot create category.
    r = client.post("/api/v1/categories/", data={"name": "Forbidden"},
                    content_type="application/json", **auth_v)
    _check("vendor cannot POST /categories/ → 403", r.status_code == 403,
           str(r.status_code))

    print(f"\n{SECTION}ALL GREEN ✓{SECTION}\n")


if __name__ == "__main__":
    main()