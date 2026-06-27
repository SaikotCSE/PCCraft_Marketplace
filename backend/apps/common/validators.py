"""Reusable field validators.

- ``FileMimeTypeValidator`` -- uses ``python-magic`` to read the actual
  file header, not just the extension. ``allowed_mime`` is a list of
  MIME prefixes (e.g. ``["image/"]`` to allow any image).
- ``BDPhoneValidator`` -- Bangladesh mobile numbers, E.164-friendly.
"""
from __future__ import annotations

import re
from pathlib import Path

from django.core.exceptions import ValidationError
from django.utils.deconstruct import deconstructible

try:  # python-magic raises at import on systems without libmagic.
    import magic as _magic  # type: ignore
except Exception:  # pragma: no cover -- handled gracefully
    _magic = None


@deconstructible
class FileMimeTypeValidator:
    """Reject files whose real MIME type isn't in the allow-list."""

    code = "invalid_mime_type"
    message = "Uploaded file has a disallowed MIME type."

    def __init__(self, allowed_mime: list[str], max_size_mb: int | None = None) -> None:
        self.allowed_mime = [m.lower() for m in allowed_mime]
        self.max_size_bytes = max_size_mb * 1024 * 1024 if max_size_mb else None

    def __call__(self, value) -> None:
        if self.max_size_bytes and value.size > self.max_size_bytes:
            raise ValidationError(
                f"File exceeds the {self.max_size_bytes // (1024 * 1024)} MB limit.",
                code="file_too_large",
            )
        if _magic is None:
            # Fall back to extension sniffing if libmagic is unavailable.
            ext = Path(value.name).suffix.lower().lstrip(".")
            if not ext:
                raise ValidationError(self.message, code=self.code)
            return
        head = value.read(2048)
        value.seek(0)
        detected = _magic.from_buffer(head, mime=True)
        if not any(detected.startswith(prefix) for prefix in self.allowed_mime):
            raise ValidationError(
                f"Detected MIME '{detected}' is not allowed.",
                code=self.code,
            )


_BD_MOBILE = re.compile(r"^\+?880?1[3-9]\d{8}$")


@deconstructible
class BDPhoneValidator:
    """Bangladesh mobile number validator (E.164 or local 01xxxxxxxxx)."""

    code = "invalid_phone"
    message = "Enter a valid Bangladesh mobile number (e.g. +8801XXXXXXXXX)."

    def __call__(self, value: str) -> None:
        if not value or not _BD_MOBILE.match(value):
            raise ValidationError(self.message, code=self.code)


@deconstructible
class ImageValidator(FileMimeTypeValidator):
    """Common image upload validator: <=10 MB, image/* MIME only."""

    def __init__(self, max_size_mb: int = 10) -> None:
        super().__init__(allowed_mime=["image/"], max_size_mb=max_size_mb)