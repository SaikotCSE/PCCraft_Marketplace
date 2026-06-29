# Module 11 - Search & Filtering (Advanced).
#
# Adds ``search_vector`` (Postgres weighted tsvector) and the matching
# GIN index, then backfills every active product row. The weighted
# search vector mirrors ``Product._refresh_search_vector``:
#
#   name (A) + short_description (B) + description (C).
#
# GIN keeps query latency at O(rows) regardless of catalog size.

import django.contrib.postgres.search
from django.contrib.postgres.search import SearchVector
from django.db import migrations
from django.db.models import F


def _backfill_search_vector(apps, schema_editor):
    """Compute the weighted search vector for every existing row."""
    Product = apps.get_model("products", "Product")
    Product.objects.update(
        search_vector=(
            SearchVector("name", weight="A")
            + SearchVector("short_description", weight="B")
            + SearchVector("description", weight="C")
        ),
    )


def _noop_reverse(apps, schema_editor):
    # Reverse is a no-op -- the column and GIN index are dropped by
    # the corresponding ``RemoveField`` / ``RemoveIndex`` ops below.
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0002_remove_product_uniq_product_sku_per_vendor_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='search_vector',
            field=django.contrib.postgres.search.SearchVectorField(blank=True, null=True),
        ),
        # GIN index makes tsvector lookups O(rows) instead of full-scan.
        # Named per Django convention so introspection stays readable.
        migrations.RunSQL(
            sql=(
                "CREATE INDEX IF NOT EXISTS "
                "products_pr_search_v_c2a0c9_gin "
                "ON products_product USING GIN (search_vector);"
            ),
            reverse_sql=(
                "DROP INDEX IF EXISTS "
                "products_pr_search_v_c2a0c9_gin;"
            ),
        ),
        migrations.RunPython(_backfill_search_vector, _noop_reverse),
    ]
