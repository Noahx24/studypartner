"""Boot-time secret gating: production refuses dev/short secrets."""
from __future__ import annotations

import subprocess
import sys


PROBE = (
    "import sys; "
    "import app.src.models.services.auth_service as a; "
    "sys.stdout.write(a.SECRET)"
)


def _boot(env: dict[str, str]) -> subprocess.CompletedProcess:
    # Subprocess so each test gets a fresh import of auth_service. The
    # module-level check runs once per process; importlib.reload would
    # share state with the test runner.
    return subprocess.run(
        [sys.executable, "-c", PROBE],
        env={**env, "PYTHONPATH": "."},
        capture_output=True,
        text=True,
    )


def test_dev_default_boots_outside_production():
    r = _boot({"STUDYPARTNER_ENV": "development"})
    assert r.returncode == 0, r.stderr
    assert r.stdout == "dev-secret-change-me"


def test_production_rejects_dev_default():
    r = _boot({"STUDYPARTNER_ENV": "production"})
    assert r.returncode != 0
    assert "dev default" in r.stderr.lower() or "refusing to boot" in r.stderr.lower()


def test_production_rejects_short_secret():
    r = _boot({"STUDYPARTNER_ENV": "production", "STUDYPARTNER_SECRET": "x" * 10})
    assert r.returncode != 0
    assert "too short" in r.stderr.lower()


def test_production_accepts_strong_secret():
    r = _boot(
        {"STUDYPARTNER_ENV": "production", "STUDYPARTNER_SECRET": "a" * 48},
    )
    assert r.returncode == 0, r.stderr
    assert r.stdout == "a" * 48
