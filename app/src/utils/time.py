"""Timezone-aware UTC time helpers.

`datetime.utcnow()` is deprecated and produces a naive datetime that loses
timezone information. All new code should use `utcnow_aware()`; `utcnow_iso()`
is a drop-in replacement for `datetime.utcnow().isoformat()`.
"""
from __future__ import annotations

from datetime import datetime, timezone


def utcnow_aware() -> datetime:
    return datetime.now(timezone.utc)


def utcnow_iso() -> str:
    return utcnow_aware().isoformat()
