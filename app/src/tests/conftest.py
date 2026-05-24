"""Test-suite-wide setup.

Disables the rate limiter so tests can fire many requests at the same
endpoint without tripping the production rate-limits. Also pre-sets the
required STUDYPARTNER_* env vars so individual test modules don't have
to repeat the boilerplate.

Pytest auto-loads this before any test module in the directory.
"""
from __future__ import annotations

import os

os.environ["STUDYPARTNER_RATELIMIT_DISABLE"] = "1"
os.environ.setdefault("STUDYPARTNER_MOODLE_BASE_URL", "https://lms.example")
os.environ.setdefault(
    "STUDYPARTNER_SECRET",
    "test-secret-long-enough-for-prod-and-tests-and-then-some",
)
