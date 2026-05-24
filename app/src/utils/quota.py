"""Per-user daily AI-call quota.

Cost control for LLM-backed routes. Cache hits do not count against
the quota — only invocations that go to the live backend (Anthropic /
Ollama). The deterministic stub is also free.

Default 100 calls/24h per user. Override with
STUDYPARTNER_AI_CALLS_PER_DAY. The window is a rolling 24h, not a
calendar day — this means a burst doesn't get refunded at midnight,
which is fairer to the institution paying the API bill.
"""
from __future__ import annotations

from datetime import timedelta
import os

from fastapi import HTTPException

from app.src.utils.time import utcnow_aware
from app.storage import count_ai_calls_since


def _daily_quota() -> int:
    return int(os.environ.get("STUDYPARTNER_AI_CALLS_PER_DAY", "100"))


def enforce_ai_quota(user_id: str) -> None:
    """Raise HTTPException(429) if the user has exhausted their daily
    AI quota. Cheap query (single COUNT on an indexed column)."""
    quota = _daily_quota()
    if quota <= 0:
        return  # 0 / negative disables the quota — useful for tests
    since = (utcnow_aware() - timedelta(hours=24)).isoformat()
    used = count_ai_calls_since(user_id, since)
    if used >= quota:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily AI quota exceeded ({used}/{quota} calls in last 24h). "
                "Try again later or contact support."
            ),
        )
