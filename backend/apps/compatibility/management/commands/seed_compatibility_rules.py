"""Seed the compatibility rule engine with the canonical 10 rules.

This command is idempotent -- it uses ``get_or_create`` keyed on the
stable identifiers (``name`` for attributes, ``rule_name`` for rules)
so re-running ``python manage.py seed_compatibility_rules`` is safe.

The rule set matches ``PCCraft_Master_Spec_v4.md`` §2.10 verbatim:

  1. CPU + MOBO socket match              (MATCH / error)
  2. MOBO + RAM generation match          (MATCH / error)
  3. CASE + MOBO form-factor containment (MEMBER_OF / error)
  4. CASE + GPU max length               (RANGE_MAX / error)
  5. CASE + COOLER max height            (RANGE_MAX / error)
  6. PSU + total component TDP           (POWER_CHECK / error)
  7. STORAGE + MOBO interface compat     (MEMBER_OF / warning)
  8. RAM + MOBO generation redundancy    (MATCH / error)
  9. MOBO + CPU cooler socket match     (MEMBER_OF / error)
 10. PSU wattage >= recommended          (POWER_CHECK / error)
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.categories.models import Category
from apps.compatibility.models import (
    AttributeDataType,
    CompatibilityAttribute,
    CompatibilityRule,
    RuleSeverity,
    RuleType,
)


# ====================================================================
# Seed data
# ====================================================================
ATTRIBUTES: list[dict] = [
    {"name": "socket", "description": "CPU socket identifier (AM5, LGA1700, ...).", "data_type": AttributeDataType.STRING},
    {"name": "generation", "description": "Memory/board generation identifier (DDR4, DDR5, AM5, ...).", "data_type": AttributeDataType.STRING},
    {"name": "form_factor", "description": "Board form factor (ATX, mATX, ITX, ...).", "data_type": AttributeDataType.STRING},
    {"name": "supported_form_factors", "description": "List of board form factors supported by the case.", "data_type": AttributeDataType.JSON_ARRAY},
    {"name": "max_gpu_length_mm", "description": "Maximum GPU length the case accepts, in millimetres.", "data_type": AttributeDataType.INTEGER},
    {"name": "gpu_length_mm", "description": "GPU card length in millimetres.", "data_type": AttributeDataType.INTEGER},
    {"name": "max_cooler_height_mm", "description": "Maximum CPU cooler height the case accepts, in millimetres.", "data_type": AttributeDataType.INTEGER},
    {"name": "cooler_height_mm", "description": "CPU cooler height in millimetres.", "data_type": AttributeDataType.INTEGER},
    {"name": "tdp", "description": "Component thermal design power, in watts.", "data_type": AttributeDataType.INTEGER},
    {"name": "wattage", "description": "PSU rated wattage.", "data_type": AttributeDataType.INTEGER},
    {"name": "interface", "description": "Storage interface (NVMe, SATA, ...).", "data_type": AttributeDataType.STRING},
    {"name": "supported_interfaces", "description": "List of storage interfaces the board supports.", "data_type": AttributeDataType.JSON_ARRAY},
    {"name": "cooler_socket_support", "description": "List of CPU sockets the cooler supports.", "data_type": AttributeDataType.JSON_ARRAY},
]


# (rule_name, category_a_slug, category_b_slug, attr_a, attr_b, type, severity, description)
RULES: list[tuple] = [
    (
        "CPU_MOBO_SOCKET_MATCH",
        "cpus", "motherboards",
        "socket", "socket",
        RuleType.MATCH, RuleSeverity.ERROR,
        "CPU socket must match motherboard socket.",
    ),
    (
        "MOBO_RAM_GENERATION_MATCH",
        "motherboards", "ram",
        "generation", "generation",
        RuleType.MATCH, RuleSeverity.ERROR,
        "Motherboard generation must match RAM generation (DDR4 vs DDR5).",
    ),
    (
        "CASE_MOBO_FORM_FACTOR",
        "pc-cases", "motherboards",
        "supported_form_factors", "form_factor",
        RuleType.MEMBER_OF, RuleSeverity.ERROR,
        "Motherboard form factor must be supported by the case.",
    ),
    (
        "CASE_GPU_LENGTH",
        "pc-cases", "gpus",
        "max_gpu_length_mm", "gpu_length_mm",
        RuleType.RANGE_MAX, RuleSeverity.ERROR,
        "GPU must fit inside the case's max GPU length.",
    ),
    (
        "CASE_COOLER_HEIGHT",
        "pc-cases", "cpu-coolers",
        "max_cooler_height_mm", "cooler_height_mm",
        RuleType.RANGE_MAX, RuleSeverity.ERROR,
        "CPU cooler must fit inside the case's max cooler height.",
    ),
    (
        "PSU_TDP_HEADROOM",
        "power-supplies", "cpus",
        "wattage", "tdp",
        RuleType.POWER_CHECK, RuleSeverity.ERROR,
        "PSU wattage must exceed component TDP plus headroom.",
    ),
    (
        "STORAGE_MOBO_INTERFACE",
        "ssd", "motherboards",
        "interface", "supported_interfaces",
        RuleType.MEMBER_OF, RuleSeverity.WARNING,
        "Storage interface is best supported by the motherboard's storage ports.",
    ),
    (
        "RAM_MOBO_GENERATION",
        "ram", "motherboards",
        "generation", "generation",
        RuleType.MATCH, RuleSeverity.ERROR,
        "RAM generation must match motherboard slots.",
    ),
    (
        "MOBO_CPU_COOLER_SOCKET",
        "motherboards", "cpu-coolers",
        "socket", "cooler_socket_support",
        RuleType.MEMBER_OF, RuleSeverity.ERROR,
        "CPU cooler must list the motherboard's CPU socket as supported.",
    ),
    (
        "PSU_WATTAGE_RECOMMENDED",
        "power-supplies", "gpus",
        "wattage", "tdp",
        RuleType.POWER_CHECK, RuleSeverity.ERROR,
        "PSU wattage must cover the GPU's TDP plus headroom.",
    ),
]


# ====================================================================
# Command
# ====================================================================
class Command(BaseCommand):
    help = "Seed the compatibility rule engine with the canonical rule set."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete every existing CompatibilityRule + Attribute before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            deleted_rules, _ = CompatibilityRule.objects.all().delete()
            deleted_attrs, _ = CompatibilityAttribute.objects.all().delete()
            self.stdout.write(self.style.WARNING(
                "Deleted %d rule(s), %d attribute(s)." % (deleted_rules, deleted_attrs)
            ))

        attr_by_name: dict[str, CompatibilityAttribute] = {}
        for spec in ATTRIBUTES:
            obj, created = CompatibilityAttribute.objects.get_or_create(
                name=spec["name"],
                defaults={
                    "description": spec["description"],
                    "data_type": spec["data_type"],
                    "is_active": True,
                },
            )
            attr_by_name[obj.name] = obj
            self._log("attribute", obj, created)

        # Pre-fetch all categories once -- the rule engine needs both
        # sides resolved to FKs.
        cat_by_slug = {c.slug: c for c in Category.objects.all()}

        for (
            rule_name, slug_a, slug_b, attr_a, attr_b,
            rule_type, severity, description,
        ) in RULES:
            cat_a = cat_by_slug.get(slug_a)
            cat_b = cat_by_slug.get(slug_b)
            if cat_a is None or cat_b is None:
                self.stdout.write(self.style.ERROR(
                    "Skipping %s -- category missing: %s / %s"
                    % (rule_name, slug_a, slug_b)
                ))
                continue
            obj, created = CompatibilityRule.objects.get_or_create(
                rule_name=rule_name,
                defaults={
                    "category_a": cat_a,
                    "category_b": cat_b,
                    "attribute_a": attr_by_name[attr_a],
                    "attribute_b": attr_by_name[attr_b],
                    "rule_type": rule_type,
                    "severity": severity,
                    "description": description,
                    "is_active": True,
                },
            )
            self._log("rule", obj, created)

    def _log(self, label, obj, created):
        verb = "Created" if created else "Found"
        self.stdout.write("%s %s: %s" % (verb, label, obj))
