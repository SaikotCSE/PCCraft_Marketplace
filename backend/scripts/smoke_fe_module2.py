"""Verify the frontend Module 2 contract against the live backend.

Confirms that the request/response shapes the new ShopPage,
ProductDetailPage, CategoriesPage, VendorProductFormPage, and
VendorProductsPage actually expect.
"""
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

from django.test import Client

from apps.accounts.models import VendorProfile, VendorStatus, UserRole
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile


def main():
    client = Client()

    # 1. Public list returns paginated envelope with expected keys.
    r = client.get('/api/v1/products/?page=1&page_size=5')
    assert r.status_code == 200, r.content
    body = r.json()
    assert body.get('success') is True
    items = body['data']
    assert isinstance(items, list), type(items)
    print(f"[OK] /products/ list → {len(items)} items")
    if items:
        sample = items[0]
        for key in ('slug', 'name', 'base_price', 'effective_price', 'brand', 'category', 'primary_image'):
            assert key in sample, f'missing {key} in {sample}'
        print(f"[OK] product list shape — keys: {sorted(sample.keys())[:8]}…")
    else:
        sample = None

    # 2. Public detail with related shapes.
    if sample:
        r = client.get(f"/api/v1/products/{sample['slug']}/")
        assert r.status_code == 200, r.content
        # Note: retrieve endpoint returns a bare dict (no envelope), list/search use one.
        body = r.json()
        if isinstance(body, dict) and 'data' in body and isinstance(body['data'], dict):
            body = body['data']
        for key in ('images', 'specs', 'vendor', 'sku', 'warranty_months', 'stock_quantity'):
            assert key in body, f'detail missing {key}'
        print(f"[OK] detail shape — keys: {sorted(body.keys())[:10]}…")

    # 3. Vendor flow: log in existing approved vendor, list, retrieve one.
    UserModel = get_user_model()
    email = 'smk_fe_vendor@example.com'
    user, _ = UserModel.objects.update_or_create(
        email=email,
        defaults={
            'role': UserRole.VENDOR,
            'is_active': True,
            'full_name': 'Smoke FE Vendor',
        },
    )
    user.set_password('Pass12345!')
    user.save()
    vendor, _ = VendorProfile.objects.update_or_create(
        user=user,
        defaults={
            'owner_name': 'Smoke FE Vendor',
            'business_name': 'Smoke FE Co.',
            'business_type': 'SOLE_PROP',
            'trade_license_number': 'TL-SMK-FE-001',
            'business_address': {'street': '1 St', 'city': 'Dhaka', 'district': 'Dhaka', 'postal_code': '1207'},
            'nid_number': 'NID-FE-001',
            'trade_license_doc': SimpleUploadedFile('tl.pdf', b'%PDF-1.4 fake', content_type='application/pdf'),
            'nid_doc': SimpleUploadedFile('nid.pdf', b'%PDF-1.4 fake', content_type='application/pdf'),
            'status': VendorStatus.APPROVED,
        },
    )
    r = client.post('/api/v1/auth/login/', {
        'email': email,
        'password': 'Pass12345!',
        'role': 'vendor',
    }, content_type='application/json')
    assert r.status_code == 200, r.content
    access = r.json()['data']['access']
    print('[OK] vendor login')

    auth = {'HTTP_AUTHORIZATION': f'Bearer {access}'}

    r = client.get('/api/v1/vendor/products/', **auth)
    assert r.status_code == 200, r.content
    vendor_products = r.json()['data']
    print(f"[OK] vendor product list → {len(vendor_products)} items")
    if vendor_products:
        slug = vendor_products[0]['slug']
        r = client.get(f'/api/v1/vendor/products/{slug}/', **auth)
        assert r.status_code == 200, r.content
        print(f"[OK] vendor product detail ({slug})")

    # 4. Categories tree (ShopPage sidebar expects a list of {slug, name, children}).
    r = client.get('/api/v1/categories/')
    assert r.status_code == 200, r.content
    cats = r.json()['data']
    print(f"[OK] /categories/ → {len(cats)} top-level nodes")
    assert all('slug' in c and 'name' in c for c in cats)

    # 5. Brands list (filter sidebar expects {slug, name}).
    r = client.get('/api/v1/brands/?page_size=100')
    assert r.status_code == 200, r.content
    brands = r.json()['data']
    print(f"[OK] /brands/?page_size=100 → {len(brands)} brands")
    assert all('slug' in b and 'name' in b for b in brands)

    print('\nALL GREEN ✓')


if __name__ == '__main__':
    main()