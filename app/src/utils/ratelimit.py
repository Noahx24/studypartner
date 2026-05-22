"""Shared slowapi limiter.

Imported by both app/main.py (to register the exception handler) and by
individual route modules (to decorate handlers). One limiter instance
across the process so the in-memory counters share state.

Limits are IP-keyed by default — sufficient for brute-force / DoS
defense. Cost-control for AI endpoints is a separate, per-user concern;
that gets its own quota check inside the route handler, not slowapi.

Set STUDYPARTNER_RATELIMIT_DISABLE=1 in tests or CI to bypass the
limiter entirely. conftest.py does this automatically for pytest runs.
"""
from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    enabled=os.environ.get("STUDYPARTNER_RATELIMIT_DISABLE") != "1",
)
