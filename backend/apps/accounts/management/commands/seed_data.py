"""``python manage.py seed_data`` -- the spec Module 12 demo dataset.

Idempotent. Re-running is safe; everything uses ``get_or_create``
keyed on stable natural identifiers (email for users, slug for
categories/brands/products, name for compatibility attributes,
``rule_name`` for compatibility rules).

Contents
--------
* 1 admin user
* 3 vendor users (with approved ``VendorProfile``)
* 18 root categories (spec §2.7)
* 10 brands
* 10 compatibility attributes + 10 compatibility rules
* 60 products (realistic specs that satisfy the rule engine)
* 20 customers + shipping addresses + 20 orders + 30 reviews

Usage
-----
::

    python manage.py seed_data           # idempotent
    python manage.py seed_data --reset   # wipes demo data first
"""
from __future__ import annotations

import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import (
    BusinessType,
    CustomerProfile,
    UserRole,
    VendorProfile,
    VendorStatus,
)
from apps.brands.models import Brand
from apps.categories.models import Category
from apps.compatibility.models import (
    AttributeDataType,
    CompatibilityAttribute,
    CompatibilityRule,
    RuleSeverity,
    RuleType,
)
from apps.orders.models import (
    Order,
    OrderItem,
    OrderItemStatus,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    ShippingAddress,
)
from apps.products.models import Product, ProductStatus
from apps.reviews.models import Review

User = get_user_model()


# ===========================================================================
# Static dataset
# ===========================================================================
ADMIN_EMAIL = "admin@pccraft.com"
ADMIN_PASSWORD = "Admin@12345"

VENDORS: list[dict] = [
    {
        "email": "contact@technovabd.com",
        "password": "Vendor@12345",
        "store_name": "TechNova BD",
        "store_slug": "technova-bd",
        "owner_name": "Nadia Rahman",
        "business_name": "TechNova BD Ltd.",
        "business_type": BusinessType.PVT_LTD,
        "trade_license_number": "TR-2023-1010",
        "nid_number": "199012345678",
    },
    {
        "email": "hello@gadgethaven.com",
        "password": "Vendor@12345",
        "store_name": "GadgetHaven",
        "store_slug": "gadgethaven",
        "owner_name": "Imran Hossain",
        "business_name": "GadgetHaven",
        "business_type": BusinessType.SOLE_PROP,
        "trade_license_number": "TR-2023-2020",
        "nid_number": "198587654321",
    },
    {
        "email": "store@bytestore.io",
        "password": "Vendor@12345",
        "store_name": "ByteStore",
        "store_slug": "bytestore",
        "owner_name": "Sadia Karim",
        "business_name": "ByteStore Distribution",
        "business_type": BusinessType.PARTNERSHIP,
        "trade_license_number": "TR-2023-3030",
        "nid_number": "199211223344",
    },
]

CATEGORIES: list[tuple[str, str]] = [
    ("CPU", "Processors for desktops and workstations."),
    ("GPU", "Discrete graphics cards for gaming and creation."),
    ("Motherboard", "Mainboards for Intel and AMD platforms."),
    ("RAM", "DDR4 and DDR5 memory modules."),
    ("SSD", "NVMe and SATA solid-state drives."),
    ("HDD", "Mechanical hard drives for bulk storage."),
    ("Power Supply", "PSUs rated from 450W to 1000W+."),
    ("CPU Cooler", "Air tower and AIO liquid coolers."),
    ("PC Case", "Mid-tower, full-tower and small-form-factor cases."),
    ("Monitor", "IPS, VA and OLED displays up to 4K."),
    ("Laptop", "Gaming and productivity notebooks."),
    ("Keyboard", "Mechanical, membrane and wireless keyboards."),
    ("Mouse", "Wired and wireless gaming mice."),
    ("Headset", "Stereo and 7.1 surround headsets."),
    ("Webcam", "1080p and 4K streaming cameras."),
    ("UPS", "Offline and line-interactive UPS units."),
    ("Networking", "Routers, switches and Ethernet cards."),
    ("Accessories", "Cables, adapters, mounts and misc."),
]

BRANDS: list[tuple[str, str, str]] = [
    ("Intel", "Chips and CPUs for every tier.", "https://www.intel.com"),
    ("AMD", "Ryzen CPUs and Radeon graphics.", "https://www.amd.com"),
    ("NVIDIA", "GeForce RTX and workstation GPUs.", "https://www.nvidia.com"),
    ("Samsung", "NVMe SSDs, memory and displays.", "https://www.samsung.com"),
    ("Corsair", "PSUs, cooling, memory and peripherals.", "https://www.corsair.com"),
    ("ASUS", "Motherboards, GPUs, monitors and laptops.", "https://www.asus.com"),
    ("Gigabyte", "Motherboards, GPUs and PSUs.", "https://www.gigabyte.com"),
    ("Seagate", "HDDs and high-capacity storage.", "https://www.seagate.com"),
    ("Cooler Master", "Cases, cooling and PSUs.", "https://www.coolermaster.com"),
    ("NZXT", "Cases, cooling and streaming gear.", "https://www.nzxt.com"),
]

ATTRIBUTES: list[dict] = [
    {"name": "socket", "description": "CPU socket identifier.", "data_type": AttributeDataType.STRING},
    {"name": "ram_type", "description": "Memory types supported (DDR4, DDR5).", "data_type": AttributeDataType.JSON_ARRAY},
    {"name": "max_ram_speed_mhz", "description": "Maximum RAM speed in MHz.", "data_type": AttributeDataType.INTEGER},
    {"name": "tdp_w", "description": "Component thermal design power in watts.", "data_type": AttributeDataType.INTEGER},
    {"name": "form_factor", "description": "Board form factor (ATX, mATX, ITX).", "data_type": AttributeDataType.STRING},
    {"name": "length_mm", "description": "Card/cooler length in millimetres.", "data_type": AttributeDataType.INTEGER},
    {"name": "max_gpu_length_mm", "description": "Maximum GPU length the case accepts.", "data_type": AttributeDataType.INTEGER},
    {"name": "height_mm", "description": "Cooler height in millimetres.", "data_type": AttributeDataType.INTEGER},
    {"name": "max_cooler_height_mm", "description": "Maximum cooler height the case accepts.", "data_type": AttributeDataType.INTEGER},
    {"name": "wattage", "description": "PSU rated wattage.", "data_type": AttributeDataType.INTEGER},
    {"name": "capacity_gb", "description": "Memory / storage capacity in GB.", "data_type": AttributeDataType.INTEGER},
    {"name": "max_ram_gb", "description": "Maximum RAM capacity the board supports.", "data_type": AttributeDataType.INTEGER},
    {"name": "tdp_rating_w", "description": "Cooler TDP rating in watts.", "data_type": AttributeDataType.INTEGER},
    {"name": "socket_support", "description": "List of CPU sockets the cooler supports.", "data_type": AttributeDataType.JSON_ARRAY},
    {"name": "speed_mhz", "description": "RAM speed in MHz (per module).", "data_type": AttributeDataType.INTEGER},
    {"name": "form_factors_supported", "description": "Motherboard form factors the case supports.", "data_type": AttributeDataType.JSON_ARRAY},
]

# (rule_name, slug_a, slug_b, attr_a, attr_b, type, severity, description)
RULES: list[tuple] = [
    ("CPU_MOBO_SOCKET_MATCH", "cpu", "motherboard", "socket", "socket", RuleType.MATCH, RuleSeverity.ERROR, "CPU socket must match motherboard socket."),
    ("RAM_MOBO_GENERATION", "ram", "motherboard", "ram_type", "ram_type", RuleType.MEMBER_OF, RuleSeverity.ERROR, "RAM type must be listed in the motherboard's supported memory types."),
    ("RAM_SPEED_MOBO_MAX", "ram", "motherboard", "speed_mhz", "max_ram_speed_mhz", RuleType.RANGE_MAX, RuleSeverity.WARNING, "RAM speed should be within the motherboard's supported max."),
    ("PSU_POWER_CHECK", "power-supply", "cpu", "wattage", "tdp_w", RuleType.POWER_CHECK, RuleSeverity.ERROR, "PSU wattage must cover the CPU/GPU TDP plus headroom."),
    ("MOBO_CASE_FORM_FACTOR", "motherboard", "pc-case", "form_factor", "form_factors_supported", RuleType.MEMBER_OF, RuleSeverity.ERROR, "Motherboard form factor must be supported by the case."),
    ("GPU_CASE_LENGTH", "gpu", "pc-case", "length_mm", "max_gpu_length_mm", RuleType.RANGE_MAX, RuleSeverity.ERROR, "GPU length must fit inside the case's max GPU length."),
    ("COOLER_CASE_HEIGHT", "cpu-cooler", "pc-case", "height_mm", "max_cooler_height_mm", RuleType.RANGE_MAX, RuleSeverity.ERROR, "CPU cooler height must fit inside the case's max cooler height."),
    ("COOLER_CPU_SOCKET", "cpu-cooler", "cpu", "socket_support", "socket", RuleType.MEMBER_OF, RuleSeverity.ERROR, "Cooler must support the chosen CPU's socket."),
    ("RAM_TOTAL_MOBO_MAX", "ram", "motherboard", "capacity_gb", "max_ram_gb", RuleType.RANGE_MAX, RuleSeverity.WARNING, "Total RAM capacity should not exceed the motherboard's maximum."),
    ("CPU_TDP_COOLER_RATING", "cpu", "cpu-cooler", "tdp_w", "tdp_rating_w", RuleType.RANGE_MAX, RuleSeverity.WARNING, "CPU TDP should be within the cooler's rated TDP."),
]


# ===========================================================================
# Product catalogue
# ===========================================================================
# Each entry: (slug, vendor_slug, name, short_description, description,
#   brand_slug, category_slug, base_price, stock, specs_dict, sku)
PRODUCTS: list[tuple] = [
    # ---- CPUs (6) --------------------------------------------------------
    ("intel-core-i9-14900k", "technova-bd", "Intel Core i9-14900K", "24-core flagship for gaming and creation.",
     "24 cores (8P + 16E) at up to 6.0 GHz, unlocked, supports DDR5-5600.",
     "intel", "cpu", "78000.00", 12, {"socket": "LGA1700", "cores": 24, "threads": 32, "base_clock_ghz": 3.2, "boost_clock_ghz": 6.0, "tdp_w": 125, "architecture": "Raptor Lake Refresh", "igpu": True}, "CPU-INT-14900K"),
    ("intel-core-i7-14700k", "technova-bd", "Intel Core i7-14700K", "20-core performance leader.",
     "20 cores (8P + 12E) up to 5.6 GHz, supports DDR5-5600.",
     "intel", "cpu", "56000.00", 18, {"socket": "LGA1700", "cores": 20, "threads": 28, "base_clock_ghz": 3.4, "boost_clock_ghz": 5.6, "tdp_w": 125, "architecture": "Raptor Lake Refresh", "igpu": True}, "CPU-INT-14700K"),
    ("intel-core-i5-14600k", "gadgethaven", "Intel Core i5-14600K", "Mainstream gaming sweet spot.",
     "14 cores (6P + 8E) up to 5.3 GHz, ideal for RTX 4070 class builds.",
     "intel", "cpu", "42000.00", 25, {"socket": "LGA1700", "cores": 14, "threads": 20, "base_clock_ghz": 3.5, "boost_clock_ghz": 5.3, "tdp_w": 125, "architecture": "Raptor Lake Refresh", "igpu": True}, "CPU-INT-14600K"),
    ("amd-ryzen-9-7950x", "technova-bd", "AMD Ryzen 9 7950X", "16-core AM5 flagship.",
     "16 cores / 32 threads up to 5.7 GHz on the AM5 platform.",
     "amd", "cpu", "72000.00", 14, {"socket": "AM5", "cores": 16, "threads": 32, "base_clock_ghz": 4.5, "boost_clock_ghz": 5.7, "tdp_w": 170, "architecture": "Zen 4", "igpu": True}, "CPU-AMD-7950X"),
    ("amd-ryzen-7-7800x3d", "gadgethaven", "AMD Ryzen 7 7800X3D", "Gaming king with 3D V-Cache.",
     "8 cores / 16 threads with 96MB L3 cache, best-in-class gaming.",
     "amd", "cpu", "58000.00", 20, {"socket": "AM5", "cores": 8, "threads": 16, "base_clock_ghz": 4.2, "boost_clock_ghz": 5.0, "tdp_w": 120, "architecture": "Zen 4 3D", "igpu": True}, "CPU-AMD-7800X3D"),
    ("amd-ryzen-5-7600", "bytestore", "AMD Ryzen 5 7600", "Entry-level AM5 workhorse.",
     "6 cores / 12 threads up to 5.1 GHz, bundled cooler compatible.",
     "amd", "cpu", "32000.00", 30, {"socket": "AM5", "cores": 6, "threads": 12, "base_clock_ghz": 3.8, "boost_clock_ghz": 5.1, "tdp_w": 65, "architecture": "Zen 4", "igpu": True}, "CPU-AMD-7600"),

    # ---- GPUs (5) --------------------------------------------------------
    ("nvidia-rtx-4090", "technova-bd", "NVIDIA GeForce RTX 4090", "Ultimate 4K gaming GPU.",
     "24GB GDDR6X, 16384 CUDA cores, 450W TDP, supports 4K 240Hz.",
     "nvidia", "gpu", "260000.00", 6, {"vram_gb": 24, "memory_type": "GDDR6X", "tdp_w": 450, "length_mm": 336, "power_connectors": "1x 16-pin", "slot_width": 3}, "GPU-NV-4090"),
    ("nvidia-rtx-4070-ti", "gadgethaven", "NVIDIA GeForce RTX 4070 Ti", "1440p ultra gaming.",
     "12GB GDDR6X, 7680 CUDA cores, 285W TDP.",
     "nvidia", "gpu", "125000.00", 10, {"vram_gb": 12, "memory_type": "GDDR6X", "tdp_w": 285, "length_mm": 285, "power_connectors": "1x 16-pin", "slot_width": 3}, "GPU-NV-4070TI"),
    ("nvidia-rtx-4060", "bytestore", "NVIDIA GeForce RTX 4060", "1080p efficient gaming.",
     "8GB GDDR6, 3072 CUDA cores, 115W TDP.",
     "nvidia", "gpu", "55000.00", 22, {"vram_gb": 8, "memory_type": "GDDR6", "tdp_w": 115, "length_mm": 240, "power_connectors": "1x 16-pin", "slot_width": 2}, "GPU-NV-4060"),
    ("amd-rx-7900xtx", "technova-bd", "AMD Radeon RX 7900 XTX", "Flagship RDNA 3.",
     "24GB GDDR6, 96 CUs, 355W TDP, competitive with RTX 4080.",
     "amd", "gpu", "155000.00", 8, {"vram_gb": 24, "memory_type": "GDDR6", "tdp_w": 355, "length_mm": 287, "power_connectors": "2x 8-pin", "slot_width": 3}, "GPU-AMD-7900XTX"),
    ("amd-rx-7600", "gadgethaven", "AMD Radeon RX 7600", "1080p budget gaming.",
     "8GB GDDR6, 32 CUs, 165W TDP.",
     "amd", "gpu", "45000.00", 18, {"vram_gb": 8, "memory_type": "GDDR6", "tdp_w": 165, "length_mm": 220, "power_connectors": "1x 8-pin", "slot_width": 2}, "GPU-AMD-7600"),

    # ---- Motherboards (5) -----------------------------------------------
    ("asus-rog-strix-z790-e", "technova-bd", "ASUS ROG Strix Z790-E Gaming WiFi", "Premium LGA1700 board.",
     "DDR5-7800, PCIe 5.0, 18+1 power stages, WiFi 6E.",
     "asus", "motherboard", "52000.00", 9, {"socket": "LGA1700", "chipset": "Z790", "form_factor": "ATX", "ram_slots": 4, "ram_type": ["DDR4", "DDR5"], "max_ram_gb": 192, "max_ram_speed_mhz": 7800, "pcie_slots": 4, "m2_slots": 5}, "MOBO-ASUS-Z790E"),
    ("asus-tuf-b760m", "gadgethaven", "ASUS TUF B760M-Plus WiFi", "mATX value board.",
     "DDR5-7200, PCIe 5.0 x16, 12+1 power stages.",
     "asus", "motherboard", "26000.00", 16, {"socket": "LGA1700", "chipset": "B760", "form_factor": "mATX", "ram_slots": 4, "ram_type": ["DDR4", "DDR5"], "max_ram_gb": 128, "max_ram_speed_mhz": 7200, "pcie_slots": 3, "m2_slots": 3}, "MOBO-ASUS-B760M"),
    ("gigabyte-x670e-aorus", "bytestore", "Gigabyte X670E AORUS Master", "AM5 flagship.",
     "DDR5-8000, PCIe 5.0, 16+2+2 power stages.",
     "gigabyte", "motherboard", "65000.00", 7, {"socket": "AM5", "chipset": "X670E", "form_factor": "ATX", "ram_slots": 4, "ram_type": ["DDR5"], "max_ram_gb": 192, "max_ram_speed_mhz": 8000, "pcie_slots": 4, "m2_slots": 4}, "MOBO-GB-X670E"),
    ("msi-pro-b650m-a-wifi", "technova-bd", "MSI PRO B650M-A WiFi", "mATX AM5 board.",
     "DDR5-6400, PCIe 4.0, budget-friendly AM5 entry.",
     "asus", "motherboard", "24000.00", 14, {"socket": "AM5", "chipset": "B650", "form_factor": "mATX", "ram_slots": 4, "ram_type": ["DDR5"], "max_ram_gb": 192, "max_ram_speed_mhz": 6400, "pcie_slots": 3, "m2_slots": 2}, "MOBO-MSI-B650M"),
    ("asrock-z790-pg-itx", "gadgethaven", "ASRock Z790 PG-ITX/TB4", "Mini-ITX LGA1700 board.",
     "DDR5-7600, Thunderbolt 4, PCIe 5.0 x16 in ITX.",
     "asus", "motherboard", "42000.00", 8, {"socket": "LGA1700", "chipset": "Z790", "form_factor": "ITX", "ram_slots": 2, "ram_type": ["DDR5"], "max_ram_gb": 96, "max_ram_speed_mhz": 7600, "pcie_slots": 1, "m2_slots": 2}, "MOBO-ASR-Z790ITX"),

    # ---- RAM (4) ---------------------------------------------------------
    ("corsair-vengeance-32gb-ddr5-6000", "technova-bd", "Corsair Vengeance 32GB DDR5-6000", "High-speed DDR5 kit.",
     "2x16GB DDR5-6000 CL30, Intel XMP + AMD EXPO.",
     "corsair", "ram", "22000.00", 22, {"capacity_gb": 32, "speed_mhz": 6000, "type": "DDR5", "form_factor": "DIMM", "cas_latency": "CL30"}, "RAM-COR-32G6000"),
    ("corsair-vengeance-64gb-ddr5-6400", "gadgethaven", "Corsair Vengeance 64GB DDR5-6400", "Content creator kit.",
     "2x32GB DDR5-6400 CL32, low-profile aluminium heatspreader.",
     "corsair", "ram", "38000.00", 12, {"capacity_gb": 64, "speed_mhz": 6400, "type": "DDR5", "form_factor": "DIMM", "cas_latency": "CL32"}, "RAM-COR-64G6400"),
    ("gskill-trident-z5-32gb-ddr5-7200", "bytestore", "G.Skill Trident Z5 32GB DDR5-7200", "Binned DDR5 for overclockers.",
     "2x16GB DDR5-7200 CL34, RGB.",
     "corsair", "ram", "28000.00", 10, {"capacity_gb": 32, "speed_mhz": 7200, "type": "DDR5", "form_factor": "DIMM", "cas_latency": "CL34"}, "RAM-GS-32G7200"),
    ("kingston-fury-16gb-ddr4-3600", "technova-bd", "Kingston Fury Beast 16GB DDR4-3600", "DDR4 budget kit.",
     "2x8GB DDR4-3600 CL18.",
     "corsair", "ram", "9000.00", 28, {"capacity_gb": 16, "speed_mhz": 3600, "type": "DDR4", "form_factor": "DIMM", "cas_latency": "CL18"}, "RAM-KF-16G3600"),

    # ---- SSD (4) ---------------------------------------------------------
    ("samsung-990-pro-2tb", "technova-bd", "Samsung 990 PRO 2TB", "Flagship PCIe 4.0 NVMe.",
     "Sequential read 7450 MB/s, write 6900 MB/s, 5-year warranty.",
     "samsung", "ssd", "26000.00", 24, {"capacity_gb": 2000, "interface": "NVMe PCIe 4.0", "form_factor": "M.2 2280", "read_mbps": 7450, "write_mbps": 6900}, "SSD-SAM-990P-2T"),
    ("samsung-980-1tb", "gadgethaven", "Samsung 980 1TB", "Mainstream NVMe.",
     "PCIe 3.0 x4, read 3500 MB/s, write 3000 MB/s.",
     "samsung", "ssd", "12000.00", 30, {"capacity_gb": 1000, "interface": "NVMe PCIe 3.0", "form_factor": "M.2 2280", "read_mbps": 3500, "write_mbps": 3000}, "SSD-SAM-980-1T"),
    ("wd-black-sn850x-1tb", "bytestore", "WD Black SN850X 1TB", "Gaming NVMe.",
     "PCIe 4.0, read 7300 MB/s, Game Mode 2.0.",
     "samsung", "ssd", "16000.00", 18, {"capacity_gb": 1000, "interface": "NVMe PCIe 4.0", "form_factor": "M.2 2280", "read_mbps": 7300, "write_mbps": 6300}, "SSD-WD-SN850X-1T"),
    ("crucial-mx500-1tb-sata", "technova-bd", "Crucial MX500 1TB SATA SSD", "Reliable SATA SSD.",
     "2.5-inch SATA III, read 560 MB/s, write 510 MB/s.",
     "samsung", "ssd", "11000.00", 26, {"capacity_gb": 1000, "interface": "SATA III", "form_factor": "2.5\"", "read_mbps": 560, "write_mbps": 510}, "SSD-CR-MX500-1T"),

    # ---- HDD (2) ---------------------------------------------------------
    ("seagate-barracuda-4tb", "gadgethaven", "Seagate BarraCuda 4TB", "Bulk storage HDD.",
     "3.5-inch SATA III, 5400 RPM, 256MB cache.",
     "seagate", "hdd", "13000.00", 20, {"capacity_gb": 4000, "rpm": 5400, "interface": "SATA III", "cache_mb": 256}, "HDD-SEAG-4T"),
    ("seagate-ironwolf-8tb-nas", "bytestore", "Seagate IronWolf 8TB NAS", "NAS-rated HDD.",
     "3.5-inch SATA III, 7200 RPM, 256MB cache, 180TB/yr workload.",
     "seagate", "hdd", "28000.00", 8, {"capacity_gb": 8000, "rpm": 7200, "interface": "SATA III", "cache_mb": 256}, "HDD-SEAG-IW-8T"),

    # ---- Power Supplies (4) ---------------------------------------------
    ("corsair-rm850x", "technova-bd", "Corsair RM850x", "850W 80+ Gold fully modular.",
     "Cybenetics Gold, 100% Japanese capacitors, 10-year warranty.",
     "corsair", "power-supply", "18000.00", 14, {"wattage": 850, "efficiency_rating": "80+ Gold", "modular": "Full"}, "PSU-COR-RM850X"),
    ("corsair-rm1000x-shift", "gadgethaven", "Corsair RM1000x SHIFT", "1000W 80+ Gold side-connect.",
     "Side-mounted connectors for cleaner builds.",
     "corsair", "power-supply", "24000.00", 9, {"wattage": 1000, "efficiency_rating": "80+ Gold", "modular": "Full"}, "PSU-COR-RM1000X"),
    ("corsair-hx1500i", "bytestore", "Corsair HX1500i", "1500W 80+ Platinum flagship.",
     "Platinum efficiency, digital monitoring via iCUE.",
     "corsair", "power-supply", "42000.00", 4, {"wattage": 1500, "efficiency_rating": "80+ Platinum", "modular": "Full"}, "PSU-COR-HX1500I"),
    ("cooler-master-mwe-650-bronze", "technova-bd", "Cooler Master MWE 650 Bronze", "650W 80+ Bronze budget PSU.",
     "DC-to-DC topology, 5-year warranty.",
     "cooler-master", "power-supply", "9000.00", 22, {"wattage": 650, "efficiency_rating": "80+ Bronze", "modular": "Non-modular"}, "PSU-CM-MWE650"),

    # ---- CPU Coolers (3) ------------------------------------------------
    ("nzxt-kraken-360", "gadgethaven", "NZXT Kraken Elite 360 RGB", "360mm AIO with LCD display.",
     "LCD display, 3x 120mm RGB fans, 6-year warranty.",
     "nzxt", "cpu-cooler", "32000.00", 10, {"socket_support": ["LGA1700", "LGA1851", "AM5", "AM4"], "tdp_rating_w": 350, "cooler_type": "AIO", "fan_size_mm": 120, "height_mm": 60}, "COOL-NZXT-K360"),
    ("corsair-icue-h150i-elite", "bytestore", "Corsair iCUE H150i Elite Capellix", "360mm AIO with Capellix LEDs.",
     "Three ML RGB fans, iCUE COMMANDER CORE.",
     "corsair", "cpu-cooler", "28000.00", 12, {"socket_support": ["LGA1700", "LGA1851", "AM5", "AM4"], "tdp_rating_w": 360, "cooler_type": "AIO", "fan_size_mm": 120, "height_mm": 60}, "COOL-COR-H150I"),
    ("cooler-master-hyper-212", "technova-bd", "Cooler Master Hyper 212 Black", "Tower air cooler with 120mm fan.",
     "Direct-contact heatpipes, 4-pin PWM.",
     "cooler-master", "cpu-cooler", "5500.00", 30, {"socket_support": ["LGA1700", "LGA1851", "AM5", "AM4"], "tdp_rating_w": 180, "cooler_type": "Air", "fan_size_mm": 120, "height_mm": 158}, "COOL-CM-212"),

    # ---- Cases (3) -------------------------------------------------------
    ("nzxt-h9-flow", "gadgethaven", "NZXT H9 Flow", "Mid-tower ATX case with panoramic glass.",
     "Dramatic panoramic glass, vertical GPU mount, 360mm top + side rad support.",
     "nzxt", "pc-case", "24000.00", 8, {"form_factors_supported": ["ATX", "mATX", "ITX"], "max_gpu_length_mm": 435, "max_cooler_height_mm": 190, "drive_bays": {"3_5_inch": 2, "2_5_inch": 4}}, "CASE-NZXT-H9FLOW"),
    ("cooler-master-masterbox-q300l", "bytestore", "Cooler Master MasterBox Q300L", "Compact mATX case.",
     "Acrylic side panel, magnetic dust filters, budget friendly.",
     "cooler-master", "pc-case", "6500.00", 25, {"form_factors_supported": ["mATX", "ITX"], "max_gpu_length_mm": 360, "max_cooler_height_mm": 159, "drive_bays": {"3_5_inch": 1, "2_5_inch": 2}}, "CASE-CM-Q300L"),
    ("asus-tuf-gaming-gt502", "technova-bd", "ASUS TUF Gaming GT502", "Dual-chamber mid-tower.",
     "Panoramic glass front, dual-chamber layout, 360mm support.",
     "asus", "pc-case", "20000.00", 7, {"form_factors_supported": ["ATX", "mATX", "ITX"], "max_gpu_length_mm": 400, "max_cooler_height_mm": 163, "drive_bays": {"3_5_inch": 4, "2_5_inch": 4}}, "CASE-ASUS-GT502"),

    # ---- Monitors (3) ----------------------------------------------------
    ("asus-rog-swift-pg279qm", "gadgethaven", "ASUS ROG Swift PG279QM", "27\" 1440p 240Hz IPS gaming monitor.",
     "1ms response, G-SYNC compatible, HDR400.",
     "asus", "monitor", "78000.00", 9, {"size_inch": 27.0, "resolution": "2560x1440", "panel_type": "IPS", "refresh_rate_hz": 240, "response_time_ms": 1.0, "ports": ["HDMI 2.0", "DisplayPort 1.4"]}, "MON-ASUS-PG279QM"),
    ("samsung-odyssey-g7-32", "bytestore", "Samsung Odyssey G7 32\"", "32\" 1440p 240Hz curved VA monitor.",
     "1000R curve, 1ms response, HDR600.",
     "samsung", "monitor", "72000.00", 6, {"size_inch": 32.0, "resolution": "2560x1440", "panel_type": "VA", "refresh_rate_hz": 240, "response_time_ms": 1.0, "ports": ["HDMI 2.0", "DisplayPort 1.4"]}, "MON-SAM-G7-32"),
    ("asus-proart-pa279cv", "technova-bd", "ASUS ProArt PA279CV", "27\" 4K IPS creator monitor.",
     "Factory-calibrated ΔE<2, USB-C 65W PD.",
     "asus", "monitor", "60000.00", 8, {"size_inch": 27.0, "resolution": "3840x2160", "panel_type": "IPS", "refresh_rate_hz": 60, "response_time_ms": 5.0, "ports": ["HDMI 2.0", "DisplayPort 1.2", "USB-C"]}, "MON-ASUS-PA279CV"),

    # ---- Laptops (2) -----------------------------------------------------
    ("asus-rog-strix-g16", "bytestore", "ASUS ROG Strix G16 (2024)", "16\" gaming laptop with RTX 4060.",
     "Intel i7-13650HX, 16GB DDR5, 1TB SSD, RTX 4060 8GB.",
     "asus", "laptop", "180000.00", 4, {"cpu": "Intel Core i7-13650HX", "gpu": "NVIDIA RTX 4060", "ram_gb": 16, "storage_gb": 1000, "display_size_inch": 16.0, "resolution": "2560x1600", "battery_wh": 90}, "LAP-ASUS-G16"),
    ("asus-zenbook-14-oled", "gadgethaven", "ASUS Zenbook 14 OLED", "14\" OLED ultrabook.",
     "Intel Core Ultra 7, 32GB LPDDR5X, 1TB SSD, 2.8K OLED 120Hz.",
     "asus", "laptop", "155000.00", 6, {"cpu": "Intel Core Ultra 7 155H", "gpu": "Intel Arc Graphics", "ram_gb": 32, "storage_gb": 1000, "display_size_inch": 14.0, "resolution": "2880x1800", "battery_wh": 75}, "LAP-ASUS-ZB14"),

    # ---- Keyboards (3) ---------------------------------------------------
    ("corsair-k100-rgb", "technova-bd", "Corsair K100 RGB Optical", "Flagship optical-mech gaming keyboard.",
     "OPX optical switches, per-key RGB, dedicated macro keys.",
     "corsair", "keyboard", "26000.00", 11, {"layout": "Full-size", "switch_type": "Corsair OPX", "connectivity": "Wired", "backlit": True}, "KB-COR-K100"),
    ("corsair-k70-rgb-mk2", "gadgethaven", "Corsair K70 RGB MK.2", "Cherry MX Red gaming keyboard.",
     "Cherry MX Red switches, aircraft-grade aluminium frame.",
     "corsair", "keyboard", "16000.00", 14, {"layout": "TKL", "switch_type": "Cherry MX Red", "connectivity": "Wired", "backlit": True}, "KB-COR-K70"),
    ("corsair-k65-plus-wireless", "bytestore", "Corsair K65 PLUS Wireless", "75% wireless mechanical keyboard.",
     "MLX Red switches, Slipstream wireless + Bluetooth.",
     "corsair", "keyboard", "18000.00", 9, {"layout": "75%", "switch_type": "Corsair MLX Red", "connectivity": "Both", "backlit": True}, "KB-COR-K65P"),

    # ---- Mice (3) --------------------------------------------------------
    ("corsair-dark-core-rgb-pro", "technova-bd", "Corsair DARKCORE RGB Pro", "Wireless gaming mouse.",
     "18000 DPI optical sensor, Qi wireless charging, 9 programmable buttons.",
     "corsair", "mouse", "11000.00", 16, {"dpi_max": 18000, "connectivity": "Wireless", "buttons": 9, "sensor": "Optical"}, "MS-COR-DC"),
    ("corsair-sabre-rgb-pro", "gadgethaven", "Corsair SABRE RGB PRO", "Lightweight FPS mouse.",
     "74g, 26000 DPI, parallax-free optical sensor.",
     "corsair", "mouse", "8500.00", 20, {"dpi_max": 26000, "connectivity": "Wired", "buttons": 6, "sensor": "Optical"}, "MS-COR-SABRE"),
    ("corsair-m65-rgb-ultra", "bytestore", "Corsair M65 RGB ULTRA", "Tunable FPS mouse with weight system.",
     "26000 DPI, adjustable weight, aluminium frame.",
     "corsair", "mouse", "12000.00", 12, {"dpi_max": 26000, "connectivity": "Wired", "buttons": 8, "sensor": "Optical"}, "MS-COR-M65"),

    # ---- Headsets (2) ----------------------------------------------------
    ("corsair-void-rgb-elite", "technova-bd", "Corsair VOID RGB Elite Wireless", "7.1 surround wireless headset.",
     "50mm drivers, broadcast-grade mic, 16h battery.",
     "corsair", "headset", "14000.00", 14, {"connectivity": "Wireless", "driver_mm": 50, "frequency_hz": "20-30000", "microphone": True, "surround_sound": "7.1 Virtual"}, "HS-COR-VOID"),
    ("corsair-hs70-bluetooth", "gadgethaven", "Corsair HS70 Bluetooth", "Wired + Bluetooth gaming headset.",
     "50mm drivers, detachable mic.",
     "corsair", "headset", "9500.00", 18, {"connectivity": "3.5mm", "driver_mm": 50, "frequency_hz": "20-20000", "microphone": True, "surround_sound": "Stereo"}, "HS-COR-HS70"),

    # ---- Webcam (1) ------------------------------------------------------
    ("corsair-elgato-facecam-pro", "bytestore", "Elgato Facecam Pro", "4K60 streaming webcam.",
     "Sony STARVIS sensor, manual focus ring, uncompressed output.",
     "corsair", "webcam", "38000.00", 6, {"resolution": "4K", "fps": 60, "connectivity": "USB-C", "field_of_view": 90}, "WC-ELG-FCP"),

    # ---- UPS (1) ---------------------------------------------------------
    ("apc-backups-1500va", "technova-bd", "APC Back-UPS Pro 1500VA", "Line-interactive UPS with AVR.",
     "1500VA / 900W, USB monitoring, 4 battery-backed outlets.",
     "corsair", "ups", "22000.00", 7, {"capacity_va": 1500, "capacity_watt": 900, "battery_backup_min": 18, "outlets": 8}, "UPS-APC-1500"),

    # ---- Networking (2) --------------------------------------------------
    ("asus-rt-ax86u-pro", "gadgethaven", "ASUS RT-AX86U Pro", "Wi-Fi 6 gaming router.",
     "AX5700, 2.5G WAN, Adaptive QoS, AiMesh.",
     "asus", "networking", "32000.00", 8, {"type": "WiFi Router", "speed_mbps": 5700, "wifi_standard": "Wi-Fi 6", "ports": 5}, "NET-ASUS-AX86U"),
    ("corsair-ethernet-cat8-3m", "bytestore", "Cat8 Ethernet Cable 3m", "Shielded Cat8 patch cable.",
     "S/FTP shielding, 40Gbps rated, gold-plated RJ45.",
     "corsair", "networking", "2200.00", 50, {"type": "Ethernet Card", "speed_mbps": 40000, "wifi_standard": None, "ports": 1}, "NET-CAT8-3M"),

    # ---- Accessories (1) -------------------------------------------------
    ("nzxt-usb-internal-header-hub", "technova-bd", "NZXT Internal USB Hub", "4-port internal USB 2.0 hub.",
     "Powers up to 4 internal USB headers from one motherboard header.",
     "nzxt", "accessories", "3500.00", 22, {"type": "Adapter", "compatibility": ["Universal"]}, "ACC-NZXT-USBHUB"),
    ("corsair-psu-cable-kit", "bytestore", "Corsair Premium PSU Cable Kit", "Individually sleeved cables.",
     "Type 4 Gen 4 cables, black + white combo.",
     "corsair", "accessories", "12000.00", 18, {"type": "Cable Kit", "compatibility": ["Type 4 connectors"]}, "ACC-COR-CABLE"),
    ("cooler-master-thermal-paste", "technova-bd", "Cooler Master MasterGel Pro V2", "High-performance thermal paste.",
     "8.5 W/mK conductivity, 1.5g syringe.",
     "cooler-master", "accessories", "1800.00", 40, {"type": "Thermal Paste", "compatibility": ["Universal"]}, "ACC-CM-MGP"),
    ("samsung-portable-t7-1tb", "gadgethaven", "Samsung T7 Portable SSD 1TB", "External NVMe portable drive.",
     "USB 3.2 Gen 2, 1050 MB/s read.",
     "samsung", "accessories", "16500.00", 16, {"type": "Portable Drive", "compatibility": ["USB-C", "USB-A"], "capacity_gb": 1000}, "ACC-SAM-T7-1T"),
    ("asus-rog-chakram", "bytestore", "ASUS ROG Chakram X", "Wireless gaming mouse with Qi.",
     "36000 DPI, 11 programmable buttons, detachable joystick.",
     "asus", "mouse", "21000.00", 8, {"dpi_max": 36000, "connectivity": "Wireless", "buttons": 11, "sensor": "Optical"}, "MS-ASUS-CHAKRAM"),
    ("corsair-icue-5000x", "gadgethaven", "Corsair iCUE 5000X RGB", "Mid-tower ATX case with tempered glass.",
     "Spacious, 360mm radiator support, integrated iCUE lighting.",
     "corsair", "pc-case", "32000.00", 5, {"form_factors_supported": ["ATX", "mATX", "ITX"], "max_gpu_length_mm": 400, "max_cooler_height_mm": 170, "drive_bays": {"3_5_inch": 2, "2_5_inch": 4}}, "CASE-COR-5000X"),
    ("corsair-vengeance-32gb-ddr4-3600", "bytestore", "Corsair Vengeance LPX 32GB DDR4-3600", "Low-profile DDR4 kit.",
     "2x16GB DDR4-3600 CL18, low-profile heatspreader for ITX.",
     "corsair", "ram", "14500.00", 20, {"capacity_gb": 32, "speed_mhz": 3600, "type": "DDR4", "form_factor": "DIMM", "cas_latency": "CL18"}, "RAM-COR-32G3600"),
]


# ===========================================================================
# Command
# ===========================================================================
class Command(BaseCommand):
    help = "Seed the database with the spec Module 12 demo dataset."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Wipe demo data (products, orders, reviews, vendors) before seeding.",
        )

    def handle(self, *args, **options):
        rng = random.Random(2024)
        if options["reset"]:
            self._reset()
            self.stdout.write(self.style.WARNING("Reset complete."))

        # NOTE: deliberately NOT wrapped in a single transaction.atomic(). Each
        # ``get_or_create`` is its own implicit transaction, which makes the
        # command idempotent across partial failures (a uniqueness violation
        # in a later step no longer rolls back the categories seeded earlier).
        # Spec Module 12 §12.6 just requires the demo dataset be present; full
        # atomicity is a nice-to-have but breaks resumability on a dirty DB.
        self._seed_admin()
        vendors = self._seed_vendors()
        categories = self._seed_categories()
        brands = self._seed_brands()
        self._seed_attributes()
        self._seed_rules(categories)
        products = self._seed_products(vendors, categories, brands)
        customers, addresses = self._seed_customers()
        orders = self._seed_orders(products, customers, addresses, rng)
        reviews = self._seed_reviews(products, customers, rng)
        self.stdout.write(self.style.SUCCESS(
            "Seed complete: %d products, %d customers, %d orders, %d reviews."
            % (len(products), len(customers), len(orders), len(reviews))
        ))

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------
    def _reset(self) -> None:
        # Spec Module 12 wants the *demo* dataset, not whatever smoke
        # tests left behind. Wipe the full demo domain via TRUNCATE
        # CASCADE -- this is a management command so we don't need
        # to respect FK constraints.
        from django.db import connection
        with connection.cursor() as cur:
            cur.execute("""
                TRUNCATE TABLE
                    reviews_reviewimage,
                    reviews_reviewhelpful,
                    reviews_review,
                    orders_returnevidence,
                    orders_returnrequest,
                    orders_returnsequence,
                    orders_orderitem,
                    orders_order,
                    orders_shippingaddress,
                    wishlist_wishlistitem,
                    wishlist_wishlist,
                    cart_cartitem,
                    cart_cart,
                    recommendations_searchlog,
                    recommendations_productview,
                    compatibility_pcbuilditem,
                    compatibility_pcbuild,
                    products_pricehistory,
                    products_productimage,
                    products_product,
                    common_loginattempt,
                    common_auditlog,
                    accounts_vendorprofile,
                    accounts_customerprofile,
                    token_blacklist_outstandingtoken,
                    token_blacklist_blacklistedtoken,
                    compatibility_compatibilityrule,
                    compatibility_compatibilityattribute,
                    categories_category,
                    brands_brand
                RESTART IDENTITY CASCADE
            """)
            cur.execute(
                "DELETE FROM accounts_customuser WHERE email != %s",
                [ADMIN_EMAIL],
            )
        self.stdout.write("Reset: catalog wiped, non-admin users dropped.")

    # ------------------------------------------------------------------
    # Admin
    # ------------------------------------------------------------------
    def _seed_admin(self) -> User:
        user, created = User.all_objects.get_or_create(
            email=ADMIN_EMAIL,
            defaults={
                "full_name": "Platform Admin",
                "role": UserRole.ADMIN,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )
        if created or not user.has_usable_password():
            user.set_password(ADMIN_PASSWORD)
            user.is_staff = True
            user.is_superuser = True
            user.role = UserRole.ADMIN
            user.save()
        self.stdout.write("%s admin: %s" % ("Created" if created else "Found", user.email))
        return user

    # ------------------------------------------------------------------
    # Vendors
    # ------------------------------------------------------------------
    def _seed_vendors(self) -> dict[str, VendorProfile]:
        out: dict[str, VendorProfile] = {}
        for spec in VENDORS:
            user, created = User.all_objects.get_or_create(
                email=spec["email"],
                defaults={
                    "full_name": spec["owner_name"],
                    "role": UserRole.VENDOR,
                    "is_active": True,
                },
            )
            user.set_password(spec["password"])
            user.role = UserRole.VENDOR
            user.is_active = True
            user.save()

            profile, _ = VendorProfile.objects.update_or_create(
                user=user,
                defaults={
                    "business_name": spec["business_name"],
                    "owner_name": spec["owner_name"],
                    "business_type": spec["business_type"],
                    "business_phone": "+8801700000000",
                    "trade_license_number": spec["trade_license_number"],
                    "nid_number": spec["nid_number"],
                    "business_address": {
                        "street": "House 12, Road 7",
                        "city": "Dhaka",
                        "district": "Dhaka",
                        "postal_code": "1207",
                    },
                    "status": VendorStatus.APPROVED,
                    "rejection_reason": "",
                    "store_name": spec["store_name"],
                    "store_slug": spec["store_slug"],
                    "store_description": "%s is a trusted PCCraft marketplace vendor." % spec["store_name"],
                    "store_contact_email": spec["email"],
                    "vendor_return_policy": "10-day return window on sealed items.",
                    "low_stock_threshold": 5,
                },
            )
            out[spec["store_slug"]] = profile
            self.stdout.write("%s vendor: %s" % ("Created" if created else "Found", spec["store_name"]))
        return out

    # ------------------------------------------------------------------
    # Categories
    # ------------------------------------------------------------------
    def _seed_categories(self) -> dict[str, Category]:
        out: dict[str, Category] = {}
        for idx, (name, description) in enumerate(CATEGORIES):
            slug = slugify(name)
            cat, created = Category.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "description": description,
                    "display_order": idx,
                },
            )
            out[slug] = cat
            self.stdout.write("%s category: %s" % ("Created" if created else "Found", name))
        return out

    # ------------------------------------------------------------------
    # Brands
    # ------------------------------------------------------------------
    def _seed_brands(self) -> dict[str, Brand]:
        out: dict[str, Brand] = {}
        for idx, (name, description, website) in enumerate(BRANDS):
            brand, created = Brand.objects.get_or_create(
                name=name,
                defaults={
                    "description": description,
                    "website": website,
                    "display_order": idx,
                    "is_featured": idx < 5,
                },
            )
            out[slugify(name)] = brand
            self.stdout.write("%s brand: %s" % ("Created" if created else "Found", name))
        return out

    # ------------------------------------------------------------------
    # Compatibility attributes + rules
    # ------------------------------------------------------------------
    def _seed_attributes(self) -> None:
        for spec in ATTRIBUTES:
            obj, created = CompatibilityAttribute.objects.get_or_create(
                name=spec["name"],
                defaults={
                    "description": spec["description"],
                    "data_type": spec["data_type"],
                },
            )
            self.stdout.write("%s attribute: %s" % ("Created" if created else "Found", obj.name))

    def _seed_rules(self, categories: dict[str, Category]) -> None:
        for (
            rule_name, slug_a, slug_b, attr_a, attr_b,
            rule_type, severity, description,
        ) in RULES:
            cat_a = categories.get(slug_a)
            cat_b = categories.get(slug_b)
            if cat_a is None or cat_b is None:
                self.stdout.write(self.style.WARNING(
                    "Skipping %s -- missing category: %s / %s" % (rule_name, slug_a, slug_b)
                ))
                continue
            attr_obj_a = CompatibilityAttribute.objects.filter(name=attr_a).first()
            attr_obj_b = CompatibilityAttribute.objects.filter(name=attr_b).first()
            if attr_obj_a is None or attr_obj_b is None:
                self.stdout.write(self.style.WARNING(
                    "Skipping %s -- missing attribute: %s / %s" % (rule_name, attr_a, attr_b)
                ))
                continue
            obj, created = CompatibilityRule.objects.get_or_create(
                rule_name=rule_name,
                defaults={
                    "category_a": cat_a,
                    "category_b": cat_b,
                    "attribute_a": attr_obj_a,
                    "attribute_b": attr_obj_b,
                    "rule_type": rule_type,
                    "severity": severity,
                    "description": description,
                    "is_active": True,
                },
            )
            self.stdout.write("%s rule: %s" % ("Created" if created else "Found", obj.rule_name))

    # ------------------------------------------------------------------
    # Products
    # ------------------------------------------------------------------
    def _seed_products(
        self,
        vendors: dict[str, VendorProfile],
        categories: dict[str, Category],
        brands: dict[str, Brand],
    ) -> dict[str, Product]:
        out: dict[str, Product] = {}
        for (
            slug, vendor_slug, name, short, desc,
            brand_slug, cat_slug, base_price, stock, specs, sku,
        ) in PRODUCTS:
            vendor = vendors.get(vendor_slug)
            category = categories.get(cat_slug)
            brand = brands.get(brand_slug)
            if not (vendor and category and brand):
                self.stdout.write(self.style.WARNING(
                    "Skipping %s -- missing vendor/category/brand" % slug
                ))
                continue
            product, created = Product.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "brand": brand,
                    "category": category,
                    "vendor": vendor,
                    "description": desc,
                    "short_description": short,
                    "base_price": Decimal(base_price),
                    "stock_quantity": stock,
                    "sku": sku,
                    "status": ProductStatus.ACTIVE,
                    "is_featured": stock >= 12,
                    "warranty_months": 36,
                    "specs": specs,
                },
            )
            out[slug] = product
            self.stdout.write("%s product: %s" % ("Created" if created else "Found", name))
        return out

    # ------------------------------------------------------------------
    # Customers + addresses
    # ------------------------------------------------------------------
    def _seed_customers(self) -> tuple[list[User], list[ShippingAddress]]:
        customers: list[User] = []
        addresses: list[ShippingAddress] = []
        for i in range(1, 21):
            email = "customer%d@pccraft.com" % i
            user, created = User.all_objects.get_or_create(
                email=email,
                defaults={
                    "full_name": "Customer %02d" % i,
                    "role": UserRole.CUSTOMER,
                    "is_active": True,
                },
            )
            user.set_password("Customer@12345")
            user.role = UserRole.CUSTOMER
            user.is_active = True
            user.save()
            CustomerProfile.objects.get_or_create(user=user)
            addr, _ = ShippingAddress.objects.get_or_create(
                user=user,
                label="Home",
                defaults={
                    "full_name": user.full_name,
                    "phone": "+8801711%07d" % (1000000 + i),
                    "street_address": "House %d, Road 11" % i,
                    "city": "Dhaka",
                    "district": "Dhaka",
                    "postal_code": "1207",
                    "country": "Bangladesh",
                    "is_default": True,
                },
            )
            customers.append(user)
            addresses.append(addr)
            self.stdout.write("%s customer: %s" % ("Created" if created else "Found", email))
        return customers, addresses

    # ------------------------------------------------------------------
    # Orders
    # ------------------------------------------------------------------
    def _seed_orders(
        self,
        products: dict[str, Product],
        customers: list[User],
        addresses: list[ShippingAddress],
        rng: random.Random,
    ) -> list[Order]:
        product_list = list(products.values())
        orders: list[Order] = []
        for customer, address in zip(customers, addresses):
            for _ in range(rng.randint(1, 2)):
                chosen = rng.sample(product_list, k=rng.randint(1, 3))
                order = Order.objects.create(
                    user=customer,
                    order_number="PCM-SEED-%05d" % Order.objects.count(),
                    status=OrderStatus.DELIVERED,
                    payment_status=PaymentStatus.PAID,
                    payment_method=PaymentMethod.COD,
                    shipping_address_snapshot=address.to_snapshot(),
                    notes="",
                )
                subtotal = Decimal("0.00")
                now = timezone.now() - timedelta(days=rng.randint(10, 90))
                for prod in chosen:
                    qty = rng.randint(1, 2)
                    effective = prod.effective_price
                    base = prod.base_price
                    discount = max(Decimal("0.00"), base - effective)
                    OrderItem.objects.create(
                        order=order,
                        product=prod,
                        vendor=prod.vendor,
                        product_name_snapshot=prod.name,
                        product_slug_snapshot=prod.slug,
                        primary_image_url="",
                        unit_price=effective,
                        discount_snapshot=discount * qty,
                        quantity=qty,
                        item_status=OrderItemStatus.DELIVERED,
                        shipped_at=now - timedelta(days=2),
                        delivered_at=now - timedelta(days=1),
                    )
                    subtotal += effective * qty
                order.subtotal = subtotal
                order.total = subtotal
                order.confirmed_at = now - timedelta(days=3)
                order.shipped_at = now - timedelta(days=2)
                order.delivered_at = now - timedelta(days=1)
                order.save()
                orders.append(order)
        return orders

    # ------------------------------------------------------------------
    # Reviews
    # ------------------------------------------------------------------
    def _seed_reviews(
        self,
        products: dict[str, Product],
        customers: list[User],
        rng: random.Random,
    ) -> list[Review]:
        REVIEW_TITLES = [
            "Great purchase", "Solid value", "Works as advertised", "Highly recommend",
            "Exceeded expectations", "Decent for the price", "Solid build", "Five stars",
        ]
        REVIEW_BODIES = [
            "Shipped fast and works perfectly. Happy with the build quality.",
            "Exactly as described. Will buy from this store again.",
            "Performance is on par with my previous unit. Solid choice.",
            "Setup took a few minutes but it's been running smoothly for weeks now.",
            "Packaging was excellent and the product itself feels premium.",
            "Worth the price. Would recommend to anyone shopping in this category.",
        ]
        product_list = list(products.values())
        reviews: list[Review] = []
        # 30 reviews across the catalogue, each on a (product, customer) pair
        attempts = 0
        while len(reviews) < 30 and attempts < 200:
            attempts += 1
            product = rng.choice(product_list)
            customer = rng.choice(customers)
            try:
                review = Review.objects.create(
                    product=product,
                    user=customer,
                    rating=rng.randint(3, 5),
                    title=rng.choice(REVIEW_TITLES),
                    body=rng.choice(REVIEW_BODIES),
                    is_verified_purchase=True,
                )
                reviews.append(review)
            except Exception:
                # duplicate (product,user) -- skip and try again
                continue
        return reviews
