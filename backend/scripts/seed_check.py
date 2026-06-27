"""Verify the seed loaded correctly by writing a small report to disk."""
from __future__ import annotations

import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.categories.models import Category  # noqa: E402
from apps.brands.models import Brand  # noqa: E402
from apps.products.models import Product  # noqa: E402

out = []
out.append("categories.count = %d" % Category.objects.count())
out.append("brands.count     = %d" % Brand.objects.count())
out.append("products.count   = %d" % Product.objects.count())
out.append("")
out.append("categories (first 5):")
for c in Category.objects.all().order_by("name")[:5]:
    out.append("  - %s (slug=%s, parent=%s)" % (c.name, c.slug, c.parent))
out.append("")
out.append("brands (first 5):")
for b in Brand.objects.all().order_by("name")[:5]:
    out.append("  - %s (slug=%s, featured=%s)" % (b.name, b.slug, b.is_featured))
out.append("")
out.append("CPU category spec_template keys:")
cpu = Category.objects.filter(slug="cpus").first()
if cpu:
    out.append("  " + ", ".join(e["key"] for e in cpu.spec_template))

path = os.path.join(os.path.dirname(__file__), "seed_report.txt")
with open(path, "w") as fh:
    fh.write("\n".join(out))
print("WROTE", path)