"""Shared building blocks used by every domain app.

Import directly from submodules, e.g.::

    from apps.common.models import TimeStampedModel
    from apps.common.response import APIResponse

We deliberately do NOT re-export here at import time -- Django needs the
app registry to be ready before any model class is touched, and eager
re-exports break that contract.
"""