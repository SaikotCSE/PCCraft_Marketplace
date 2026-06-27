r"""Smoke test the BDPhoneValidator regex.

Locks in the corrected pattern ``^(?:\+?880|0)1[3-9]\d{8}$`` so future edits
to ``apps/common/validators.py`` can't silently regress the local
``01XXXXXXXXX`` form or start accepting bogus inputs like ``17123456789``.

Exits non-zero if any check fails.
"""
from __future__ import annotations

import os
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django  # noqa: E402

django.setup()

from django.core.exceptions import ValidationError  # noqa: E402

from apps.common.validators import BDPhoneValidator, _BD_MOBILE  # noqa: E402

validator = BDPhoneValidator()

# (input, expected_valid, label)
CASES: list[tuple[str, bool, str]] = [
    # ── Accepted formats ──────────────────────────────────────────────
    ("01712345678", True, "local 11-digit"),
    ("01812345678", True, "local 11-digit (018 operator)"),
    ("01912345678", True, "local 11-digit (019 operator)"),
    ("01512345678", True, "local 11-digit (015 operator)"),
    ("01612345678", True, "local 11-digit (016 operator)"),
    ("01312345678", True, "local 11-digit (013 operator)"),
    ("01412345678", True, "local 11-digit (014 Banglalink)"),
    ("+8801712345678", True, "E.164 with +"),
    ("8801712345678", True, "international without +"),
    ("+8801512345678", True, "E.164 with 015 operator"),
    # ── Rejected inputs (must remain rejected) ────────────────────────
    ("", False, "empty string"),
    (None, False, "None"),  # type: ignore[list-item]
    ("17123456789", False, "11-digit starting with 1 (no separator)"),
    ("88123456789", False, "88 + 9 digits (no 0 separator)"),
    ("+88123456789", False, "+88 + 9 digits (no 0 separator)"),
    ("017123456789", False, "12-digit local"),
    ("0171234567", False, "10-digit local"),
    ("017a2345678", False, "letters inside"),
    ("88017123456789", False, "14-digit intl (extra digit)"),
    ("+88017123456789", False, "15-char with + (extra digit)"),
    ("+880171234567", False, "short E.164"),
    ("01212345678", False, "012 prefix (not a BD mobile operator)"),
    ("01012345678", False, "010 prefix (not a BD mobile operator)"),
    ("01112345678", False, "011 prefix (not a BD mobile operator)"),
    ("02112345678", False, "02 prefix (Dhaka landline, not mobile)"),
    (" 01712345678", False, "leading whitespace"),
    ("01712345678 ", False, "trailing whitespace"),
    ("0171234567a", False, "trailing letter"),
]

passed = 0
failed = 0
for value, expected, label in CASES:
    if expected:
        try:
            validator(value)  # type: ignore[arg-type]
        except ValidationError:
            actual = False
        else:
            actual = True
    else:
        try:
            validator(value)  # type: ignore[arg-type]
        except ValidationError:
            actual = False
        else:
            actual = True

    regex_match = bool(_BD_MOBILE.match(value)) if isinstance(value, str) else False
    consistent = actual == expected and regex_match == expected

    if consistent:
        passed += 1
        print(f"  OK  {value!r:25} expected={expected!s:5}  ({label})")
    else:
        failed += 1
        print(
            f"  XX  {value!r:25} expected={expected!s:5} "
            f"actual_validator={actual!s:5} actual_regex={regex_match!s:5}  ({label})"
        )

print()
print(f"Result: {passed} passed, {failed} failed (of {len(CASES)})")
sys.exit(0 if failed == 0 else 1)