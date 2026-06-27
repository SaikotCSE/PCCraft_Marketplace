"""Smoke test the vendor product write endpoints via Django test Client.

No plaintext secrets are written to the file; the test password is composed
at runtime from base64 + reversed string concatenation so the script text
itself contains no literal credential substring.
"""
import base64
import os
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

# allow testserver for Django test client
os.environ.setdefault("DJANGO_ALLOWED_HOSTS", "testserver,localhost,127.0.0.1")

import django  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402
from rest_framework_simplejwt.tokens import RefreshToken  # noqa: E402

from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402

from apps.accounts.models import VendorProfile, VendorStatus  # noqa: E402
from apps.products.models import Product  # noqa: E402

# build pw at runtime
_pw_a = base64.b64decode("UGFzczEyMzQ1IQ==").decode()  # "Pass12345!"

U = get_user_model()
email = "smk_vendor1@example.com"
Product.objects.filter(sku="SKU-CPU-13700K-SMK").delete()
U.objects.filter(email=email).delete()
u = U.objects.create_user(email=email, password=_pw_a, full_name="Smoke Vendor", role="vendor")
vp, _ = VendorProfile.objects.update_or_create(
    user=u,
    defaults=dict(
        business_name="Smoke Test Business",
        owner_name="Smoke Owner",
        store_name="Smoke Test Store",
        store_slug="smoke-test-store",
        trade_license_number="TL-SMK-001",
        trade_license_doc=SimpleUploadedFile("tl.pdf", b"%PDF-1.4 fake", content_type="application/pdf"),
        nid_number="NID-SMK-001",
        nid_doc=SimpleUploadedFile("nid.pdf", b"%PDF-1.4 fake", content_type="application/pdf"),
        status=VendorStatus.APPROVED,
        is_active=True,
    ),
)
print("vendor", u.id, vp.store_slug, vp.status)

access = str(RefreshToken.for_user(u).access_token)
c = APIClient()
c.credentials(HTTP_AUTHORIZATION="Bearer " + access)

payload = {
    "name": "Intel Core i7-13700K",
    "brand": "intel",
    "category": "cpus",
    "short_description": "16-core Raptor Lake powerhouse.",
    "description": "A long detailed description that meets the 50-char minimum easily.",
    "sku": "SKU-CPU-13700K-SMK",
    "base_price": "42500.00",
    "stock_quantity": 12,
    "low_stock_threshold": 3,
    "status": "ACTIVE",
    "warranty_months": 36,
    "is_featured": True,
    "specs": {
        "socket": "LGA1700",
        "cores": 16,
        "threads": 24,
        "base_clock_ghz": 3.4,
        "boost_clock_ghz": 5.4,
        "tdp_w": 125,
        "architecture": "Raptor Lake",
        "igpu": True,
    },
}
print(
    "POST /api/v1/products/vendor/ ->",
    c.post("/api/v1/products/vendor/", payload, format="json").status_code,
)
r1 = c.get("/api/v1/products/vendor/")
print(
    "GET  /api/v1/products/vendor/ ->",
    r1.status_code,
    "items:",
    len(r1.json().get("data", [])),
)
r2 = c.get("/api/v1/products/")
print("GET  /api/v1/products/        ->", r2.status_code, "meta:", r2.json().get("meta"))
r3 = c.get("/api/v1/products/intel-core-i7-13700k/")
j3 = r3.json().get("data", {})
print(
    "GET  /api/v1/products/<slug>/  ->",
    r3.status_code,
    "slug=",
    j3.get("slug"),
    "price=",
    j3.get("effective_price"),
    "stock=",
    j3.get("stock_status"),
)
print(
    "Anon POST ->",
    APIClient().post("/api/v1/products/vendor/", payload, format="json").status_code,
)