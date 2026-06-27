import os, sys, pathlib, json, base64
sys.path.insert(0, '/home/wang-lin/Saikot/PCCraft_Marketplace/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.development')
os.environ.setdefault('DJANGO_ALLOWED_HOSTS','testserver,localhost,127.0.0.1')
import django; django.setup()
from django.contrib.auth import get_user_model
from apps.accounts.models import VendorProfile, VendorStatus
from apps.products.models import Product
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.files.uploadedfile import SimpleUploadedFile

_pw = base64.b64decode('UGFzczEyMzQ1IQ==').decode()
U = get_user_model()
email = 'smk_dbg2@example.com'
Product.objects.filter(sku='SKU-CPU-13700K-SMK').delete()
U.objects.filter(email=email).delete()
u = U.objects.create_user(email=email, password=_pw, full_name='Smoke', role='vendor')
vp,_ = VendorProfile.objects.update_or_create(user=u, defaults=dict(
    business_name='B', owner_name='O',
    store_name='SmokeDbg', store_slug='smoke-dbg',
    trade_license_number='TL', trade_license_doc=SimpleUploadedFile('tl.pdf',b'%PDF',content_type='application/pdf'),
    nid_number='NID', nid_doc=SimpleUploadedFile('n.pdf',b'%PDF',content_type='application/pdf'),
    status=VendorStatus.APPROVED, is_active=True,
))
access = str(RefreshToken.for_user(u).access_token)
c = APIClient(); c.credentials(HTTP_AUTHORIZATION='Bearer ' + access)
payload = dict(
    name='Intel Core i7-13700K', brand='intel', category='cpus',
    short_description='16-core Raptor Lake powerhouse.',
    description='A long detailed description that meets the 50-char minimum easily.',
    sku='SKU-CPU-13700K-SMK',
    base_price='42500.00', stock_quantity=12, low_stock_threshold=3,
    status='ACTIVE', warranty_months=36, is_featured=True,
    specs=dict(socket='LGA1700', cores=16, threads=24, base_clock_ghz=3.4,
               boost_clock_ghz=5.4, tdp_w=125, integrated_graphics='UHD 770'),
)
r = c.post('/api/v1/products/vendor/', payload, format='json')
print('status:', r.status_code)
print('body:', r.content.decode()[:2000])
