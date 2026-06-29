"""OTP smoke test."""
import os, sys
import django
b = "/home/wang-lin/Saikot/PCCraft_Marketplace/backend"
sys.path.insert(0, b)
os.chdir(b)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()
print("boot ok")