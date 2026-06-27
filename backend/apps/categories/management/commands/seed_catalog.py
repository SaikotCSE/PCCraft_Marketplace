"""Seed the catalog with the categories and brands from spec §2.7.

Usage::

    python manage.py seed_catalog            # idempotent — only creates rows that don't exist
    python manage.py seed_catalog --reset     # wipes categories/brands/products first (DEV ONLY)

Safe to re-run; rows are matched by slug.
"""
from __future__ import annotations

import logging

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.brands.models import Brand
from apps.categories.models import Category

logger = logging.getLogger(__name__)


CATEGORY_TREE: list[dict] = [
    {
        "name": "CPUs",
        "slug": "cpus",
        "description": "Processors for desktops, workstations and servers.",
        "spec_template": [
            {"key": "socket", "label": "Socket", "type": "str"},
            {"key": "cores", "label": "Cores", "type": "int"},
            {"key": "threads", "label": "Threads", "type": "int"},
            {"key": "base_clock_ghz", "label": "Base Clock (GHz)", "type": "float"},
            {"key": "boost_clock_ghz", "label": "Boost Clock (GHz)", "type": "float"},
            {"key": "tdp_w", "label": "TDP (W)", "type": "int"},
            {"key": "architecture", "label": "Architecture", "type": "str"},
            {"key": "igpu", "label": "Integrated GPU", "type": "bool"},
        ],
        "children": [],
    },
    {
        "name": "GPUs",
        "slug": "gpus",
        "description": "Discrete graphics cards for gaming and pro workloads.",
        "spec_template": [
            {"key": "vram_gb", "label": "VRAM (GB)", "type": "int"},
            {"key": "memory_type", "label": "Memory Type", "type": "str"},
            {"key": "tdp_w", "label": "TDP (W)", "type": "int"},
            {"key": "length_mm", "label": "Length (mm)", "type": "int"},
            {"key": "power_connectors", "label": "Power Connectors", "type": "str"},
            {"key": "slot_width", "label": "Slot Width", "type": "int"},
        ],
        "children": [],
    },
    {
        "name": "Motherboards",
        "slug": "motherboards",
        "description": "Mainboards for Intel and AMD platforms.",
        "spec_template": [
            {"key": "socket", "label": "Socket", "type": "str"},
            {"key": "chipset", "label": "Chipset", "type": "str"},
            {"key": "form_factor", "label": "Form Factor", "type": "str"},
            {"key": "ram_slots", "label": "RAM Slots", "type": "int"},
            {"key": "ram_type", "label": "RAM Type", "type": "list[str]"},
            {"key": "max_ram_gb", "label": "Max RAM (GB)", "type": "int"},
            {"key": "max_ram_speed_mhz", "label": "Max RAM Speed (MHz)", "type": "int"},
            {"key": "pcie_slots", "label": "PCIe Slots", "type": "int"},
            {"key": "m2_slots", "label": "M.2 Slots", "type": "int"},
        ],
        "children": [],
    },
    {
        "name": "RAM",
        "slug": "ram",
        "description": "DDR4 / DDR5 memory modules.",
        "spec_template": [
            {"key": "capacity_gb", "label": "Capacity (GB)", "type": "int"},
            {"key": "speed_mhz", "label": "Speed (MHz)", "type": "int"},
            {"key": "type", "label": "Type", "type": "str"},
            {"key": "form_factor", "label": "Form Factor", "type": "str"},
            {"key": "cas_latency", "label": "CAS Latency", "type": "str"},
        ],
        "children": [],
    },
    {
        "name": "SSD",
        "slug": "ssd",
        "description": "Solid-state drives — SATA, NVMe M.2, U.2.",
        "spec_template": [
            {"key": "capacity_gb", "label": "Capacity (GB)", "type": "int"},
            {"key": "interface", "label": "Interface", "type": "str"},
            {"key": "form_factor", "label": "Form Factor", "type": "str"},
            {"key": "read_mbps", "label": "Read (MB/s)", "type": "int"},
            {"key": "write_mbps", "label": "Write (MB/s)", "type": "int"},
        ],
        "children": [],
    },
    {
        "name": "HDD",
        "slug": "hdd",
        "description": "Hard disk drives for bulk storage.",
        "spec_template": [
            {"key": "capacity_gb", "label": "Capacity (GB)", "type": "int"},
            {"key": "rpm", "label": "RPM", "type": "int"},
            {"key": "interface", "label": "Interface", "type": "str"},
            {"key": "cache_mb", "label": "Cache (MB)", "type": "int"},
        ],
        "children": [],
    },
    {
        "name": "Power Supplies",
        "slug": "power-supplies",
        "description": "ATX power supplies from 450W to 1300W+.",
        "spec_template": [
            {"key": "wattage", "label": "Wattage (W)", "type": "int"},
            {"key": "efficiency_rating", "label": "Efficiency", "type": "str"},
            {"key": "modular", "label": "Modularity", "type": "str"},
        ],
        "children": [],
    },
    {
        "name": "CPU Coolers",
        "slug": "cpu-coolers",
        "description": "Air tower and AIO liquid coolers.",
        "spec_template": [
            {"key": "socket_support", "label": "Sockets Supported", "type": "list[str]"},
            {"key": "tdp_rating_w", "label": "TDP Rating (W)", "type": "int"},
            {"key": "cooler_type", "label": "Cooler Type", "type": "str"},
            {"key": "fan_size_mm", "label": "Fan Size (mm)", "type": "int"},
            {"key": "height_mm", "label": "Height (mm)", "type": "int"},
        ],
        "children": [],
    },
    {
        "name": "PC Cases",
        "slug": "pc-cases",
        "description": "Mid-tower, full-tower, ITX and open-air chassis.",
        "spec_template": [
            {"key": "form_factors_supported", "label": "Form Factors Supported",
             "type": "list[str]"},
            {"key": "max_gpu_length_mm", "label": "Max GPU Length (mm)", "type": "int"},
            {"key": "max_cooler_height_mm", "label": "Max Cooler Height (mm)",
             "type": "int"},
            {"key": "drive_bays", "label": "Drive Bays", "type": "dict"},
        ],
        "children": [],
    },
    {
        "name": "Monitors",
        "slug": "monitors",
        "description": "1080p, 1440p, 4K and ultrawide panels.",
        "spec_template": [
            {"key": "size_inch", "label": "Size (in)", "type": "float"},
            {"key": "resolution", "label": "Resolution", "type": "str"},
            {"key": "panel_type", "label": "Panel Type", "type": "str"},
            {"key": "refresh_rate_hz", "label": "Refresh Rate (Hz)", "type": "int"},
            {"key": "response_time_ms", "label": "Response Time (ms)", "type": "float"},
            {"key": "ports", "label": "Ports", "type": "list[str]"},
        ],
        "children": [],
    },
    {
        "name": "Laptops",
        "slug": "laptops",
        "description": "Ultrabooks, gaming laptops and mobile workstations.",
        "spec_template": [
            {"key": "cpu", "label": "CPU", "type": "str"},
            {"key": "gpu", "label": "GPU", "type": "str"},
            {"key": "ram_gb", "label": "RAM (GB)", "type": "int"},
            {"key": "storage_gb", "label": "Storage (GB)", "type": "int"},
            {"key": "display_size_inch", "label": "Display Size (in)", "type": "float"},
            {"key": "resolution", "label": "Resolution", "type": "str"},
            {"key": "battery_wh", "label": "Battery (Wh)", "type": "int"},
        ],
        "children": [],
    },
    {
        "name": "Keyboards",
        "slug": "keyboards",
        "description": "Mechanical, membrane and wireless keyboards.",
        "spec_template": [
            {"key": "layout", "label": "Layout", "type": "str"},
            {"key": "switch_type", "label": "Switch Type", "type": "str"},
            {"key": "connectivity", "label": "Connectivity", "type": "str"},
            {"key": "backlit", "label": "Backlit", "type": "bool"},
        ],
        "children": [],
    },
    {
        "name": "Mice",
        "slug": "mice",
        "description": "Wired, wireless and ergo mice.",
        "spec_template": [
            {"key": "dpi_max", "label": "Max DPI", "type": "int"},
            {"key": "connectivity", "label": "Connectivity", "type": "str"},
            {"key": "buttons", "label": "Buttons", "type": "int"},
            {"key": "sensor", "label": "Sensor", "type": "str"},
        ],
        "children": [],
    },
    {
        "name": "Headsets",
        "slug": "headsets",
        "description": "Gaming, studio and conference headsets.",
        "spec_template": [
            {"key": "connectivity", "label": "Connectivity", "type": "str"},
            {"key": "driver_mm", "label": "Driver (mm)", "type": "int"},
            {"key": "frequency_hz", "label": "Frequency Response", "type": "str"},
            {"key": "microphone", "label": "Microphone", "type": "bool"},
            {"key": "surround_sound", "label": "Surround Sound", "type": "str"},
        ],
        "children": [],
    },
    {
        "name": "Webcams",
        "slug": "webcams",
        "description": "1080p and 4K streaming / conferencing cameras.",
        "spec_template": [
            {"key": "resolution", "label": "Resolution", "type": "str"},
            {"key": "fps", "label": "FPS", "type": "int"},
            {"key": "connectivity", "label": "Connectivity", "type": "str"},
            {"key": "field_of_view", "label": "FOV", "type": "int"},
        ],
        "children": [],
    },
    {
        "name": "UPS",
        "slug": "ups",
        "description": "Uninterruptible power supplies.",
        "spec_template": [
            {"key": "capacity_va", "label": "Capacity (VA)", "type": "int"},
            {"key": "capacity_watt", "label": "Capacity (W)", "type": "int"},
            {"key": "battery_backup_min", "label": "Battery Backup (min)",
             "type": "int"},
            {"key": "outlets", "label": "Outlets", "type": "int"},
        ],
        "children": [],
    },
    {
        "name": "Networking",
        "slug": "networking",
        "description": "WiFi routers, switches, NICs and mesh systems.",
        "spec_template": [
            {"key": "type", "label": "Type", "type": "str"},
            {"key": "speed_mbps", "label": "Speed (Mbps)", "type": "int"},
            {"key": "wifi_standard", "label": "Wi-Fi Standard", "type": "str"},
            {"key": "ports", "label": "Ports", "type": "int"},
        ],
        "children": [],
    },
    {
        "name": "Accessories",
        "slug": "accessories",
        "description": "Cables, adapters, mounts and other peripherals.",
        "spec_template": [
            {"key": "type", "label": "Type", "type": "str"},
            {"key": "compatibility", "label": "Compatibility", "type": "list[str]"},
        ],
        "children": [],
    },
]


BRANDS: list[dict] = [
    {"name": "Intel", "description": "Leading CPU manufacturer.", "is_featured": True},
    {"name": "AMD", "description": "Ryzen CPUs and Radeon GPUs.", "is_featured": True},
    {"name": "NVIDIA", "description": "GeForce and Quadro GPUs.", "is_featured": True},
    {"name": "ASUS", "description": "Motherboards, GPUs, laptops, monitors.", "is_featured": True},
    {"name": "MSI", "description": "Gaming motherboards, GPUs, laptops.", "is_featured": True},
    {"name": "Gigabyte", "description": "Motherboards and GPUs.", "is_featured": False},
    {"name": "ASRock", "description": "Motherboards for every socket.", "is_featured": False},
    {"name": "Corsair", "description": "PSUs, RAM, coolers, cases, peripherals.",
     "is_featured": True},
    {"name": "G.Skill", "description": "Enthusiast-grade RAM kits.", "is_featured": False},
    {"name": "Kingston", "description": "SSDs, RAM and flash drives.", "is_featured": False},
    {"name": "Samsung", "description": "NVMe SSDs and monitors.", "is_featured": True},
    {"name": "WD (Western Digital)", "description": "HDDs, SSDs and storage.",
     "is_featured": False},
    {"name": "Seagate", "description": "Hard drives and NAS storage.", "is_featured": False},
    {"name": "Crucial", "description": "Micron's consumer SSD/RAM brand.",
     "is_featured": False},
    {"name": "NZXT", "description": "PC cases, AIO coolers, PSUs.", "is_featured": True},
    {"name": "Lian Li", "description": "Premium aluminium cases.", "is_featured": False},
    {"name": "Cooler Master", "description": "Coolers, cases, PSUs.", "is_featured": False},
    {"name": "be quiet!", "description": "Silent PSUs and coolers.", "is_featured": False},
    {"name": "Noctua", "description": "Premium air coolers and fans.", "is_featured": True},
    {"name": "Arctic", "description": "Affordable air coolers and thermal paste.",
     "is_featured": False},
    {"name": "Deepcool", "description": "Cases, coolers and PSUs.", "is_featured": False},
    {"name": "EVGA", "description": "GPUs and PSUs.", "is_featured": False},
    {"name": "Zotac", "description": "Compact GPUs and mini PCs.", "is_featured": False},
    {"name": "Sapphire", "description": "AMD GPU AIB partner.", "is_featured": False},
    {"name": "PowerColor", "description": "AMD GPU AIB partner.", "is_featured": False},
    {"name": "Logitech", "description": "Peripherals — mice, keyboards, webcams.",
     "is_featured": True},
    {"name": "Razer", "description": "Gaming peripherals and laptops.", "is_featured": True},
    {"name": "SteelSeries", "description": "Esports peripherals.", "is_featured": False},
    {"name": "HyperX", "description": "Headsets, keyboards and mice.", "is_featured": False},
    {"name": "Sony", "description": "INZONE gaming headsets and monitors.",
     "is_featured": False},
    {"name": "Acer", "description": "Predator gaming monitors and laptops.",
     "is_featured": False},
    {"name": "LG", "description": "Ultragear and UltraFine monitors.", "is_featured": False},
    {"name": "BenQ", "description": "MOBIUZ and ZOWIE monitors.", "is_featured": False},
    {"name": "Dell", "description": "Alienware and UltraSharp monitors.",
     "is_featured": False},
    {"name": "TP-Link", "description": "Networking — routers, switches, mesh.",
     "is_featured": False},
    {"name": "Netgear", "description": "Nighthawk routers and switches.",
     "is_featured": False},
    {"name": "Asus ROG", "description": "Republic of Gamers line.", "is_featured": False},
    {"name": "APC", "description": "Back-UPS and Smart-UPS line.", "is_featured": False},
    {"name": "CyberPower", "description": "UPS systems and PDUs.", "is_featured": False},
]


class Command(BaseCommand):
    help = "Seed the catalog with the categories & brands from spec §2.7."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Wipe brands, categories and products first (DEV ONLY).",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        if options.get("reset"):
            from apps.products.models import Product
            Product.all_objects.all().delete()
            Category.all_objects.all().delete()
            Brand.all_objects.all().delete()
            self.stdout.write(self.style.WARNING("Catalog wiped."))

        for entry in CATEGORY_TREE:
            parent, created = Category.all_objects.get_or_create(
                slug=entry["slug"],
                defaults={
                    "name": entry["name"],
                    "description": entry["description"],
                    "spec_template": entry["spec_template"],
                },
            )
            # Update mutable fields even if the row existed.
            parent.name = entry["name"]
            parent.description = entry["description"]
            parent.spec_template = entry["spec_template"]
            parent.save()
            for idx, child in enumerate(entry["children"]):
                Category.all_objects.update_or_create(
                    slug=child["slug"],
                    defaults={
                        "name": child["name"],
                        "parent": parent,
                        "description": child.get("description", ""),
                        "spec_template": child.get("spec_template", []),
                        "display_order": idx,
                    },
                )

        self.stdout.write(self.style.SUCCESS(
            "Seeded %d top-level categories." % len(CATEGORY_TREE),
        ))

        for idx, entry in enumerate(BRANDS):
            Brand.all_objects.update_or_create(
                name=entry["name"],
                defaults={
                    "description": entry["description"],
                    "is_featured": entry["is_featured"],
                    "display_order": idx,
                },
            )
        self.stdout.write(self.style.SUCCESS("Seeded %d brands." % len(BRANDS)))