"""Test-suite-wide setup.

Disables the rate limiter so tests can fire many requests at the same
endpoint without tripping the production rate-limits. Also pre-sets the
required STUDYPARTNER_* env vars so individual test modules don't have
to repeat the boilerplate.

Pytest auto-loads this before any test module in the directory.
"""
from __future__ import annotations

import os
import tempfile

os.environ["STUDYPARTNER_RATELIMIT_DISABLE"] = "1"
os.environ.setdefault("STUDYPARTNER_MOODLE_BASE_URL", "https://lms.example")
os.environ.setdefault(
    "STUDYPARTNER_SECRET",
    "test-secret-long-enough-for-prod-and-tests-and-then-some",
)

# Isolate the test database from the dev database. The Moodle suite's
# _fresh_db() unlinks storage.DB_PATH between cases; without this override
# DB_PATH resolves to data/studypartner.db and running pytest wipes the
# developer's local data. Point it at a throwaway temp file instead. Must be
# set before app.storage is imported (conftest is loaded first by pytest).
os.environ.setdefault(
    "STUDYPARTNER_DB_PATH",
    os.path.join(tempfile.gettempdir(), "studypartner_test.db"),
)

# A valid (test-only) Fernet key so the Moodle-token encryption path runs
# without an externally supplied key. This is not a production secret.
os.environ.setdefault(
    "STUDYPARTNER_FERNET_KEY",
    "Ah05ChLhy5i8mEnAdnAZXyqRYpQT7R0UpAyr7aWiy3E=",
)
