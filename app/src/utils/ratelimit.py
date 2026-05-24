"""Shared slowapi limiter.

Imported by both app/main.py (to register the exception handler) and by
individual route modules (to decorate handlers). One limiter instance
across the process so the in-memory counters share state.

Limits are IP-keyed. Cost-control for AI endpoints is a separate,
per-user concern; that gets its own quota check inside the route
handler, not slowapi.

Proxy awareness — STUDYPARTNER_TRUST_PROXY=1 makes the key function
read the first hop of X-Forwarded-For (set by the reverse proxy /
load balancer / CDN that fronts us). Without it, all clients behind
the proxy share the same socket-peer IP — one noisy user trips 429
for everyone, turning the limiter into an availability regression.

Only enable when you actually have a trusted proxy in front; if any
client can reach the app directly, X-Forwarded-For is attacker-
controlled and per-IP limits collapse.

Set STUDYPARTNER_RATELIMIT_DISABLE=1 in tests or CI to bypass the
limiter entirely. conftest.py does this automatically for pytest runs.
"""
from __future__ import annotations

import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _client_key(request: Request) -> str:
    """Pick the rate-limit key for this request.

    Opt-in trust on X-Forwarded-For via STUDYPARTNER_TRUST_PROXY=1
    (any truthy value). The first comma-separated hop is the original
    client; later hops are intermediate proxies. We trim whitespace
    and reject blank values, falling back to the socket peer.
    """
    if os.environ.get("STUDYPARTNER_TRUST_PROXY", "").lower() in ("1", "true", "yes"):
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            first = xff.split(",", 1)[0].strip()
            if first:
                return first
        real_ip = request.headers.get("x-real-ip", "").strip()
        if real_ip:
            return real_ip
    return get_remote_address(request)


limiter = Limiter(
    key_func=_client_key,
    enabled=os.environ.get("STUDYPARTNER_RATELIMIT_DISABLE") != "1",
)
