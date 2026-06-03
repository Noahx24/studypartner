"""Per-user daily AI-call quota.

Cap user-driven LLM invocations to a daily limit so a single user
cannot rack up the Anthropic bill in a tight loop. Cache hits and
stub-LLM fallback calls don't count against the quota.
"""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.storage import DB_PATH, count_ai_calls_since, init_db, log_ai_call
from app.src.utils.time import utcnow_aware


def _fresh_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client):
    r = client.post(
        "/users/register",
        json={"name": "x", "email": "q@q.test", "password": "longenoughpw1!"},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user_id"]


def test_log_and_count_helpers_roundtrip():
    _fresh_db()
    client = TestClient(app)
    _, uid = _register(client)

    log_ai_call(uid, "summary", "claude-haiku-4-5")
    log_ai_call(uid, "subtopic_quiz", "claude-haiku-4-5")
    since = "2000-01-01T00:00:00+00:00"
    assert count_ai_calls_since(uid, since) == 2


def test_ai_regenerate_quota_returns_429(monkeypatch):
    """Quota of 2 → third regenerate returns 429."""
    monkeypatch.setenv("STUDYPARTNER_AI_CALLS_PER_DAY", "2")
    _fresh_db()
    client = TestClient(app)
    token, uid = _register(client)
    auth = {"Authorization": f"Bearer {token}"}

    # Pre-load two billable calls to fill the quota.
    log_ai_call(uid, "summary", "claude-haiku-4-5")
    log_ai_call(uid, "subtopic_quiz", "claude-haiku-4-5")

    # Third call must be rejected — but invalid scope should still 400
    # to prove the quota check runs after scope validation.
    r_bad_scope = client.post(
        "/ai/regenerate",
        headers=auth,
        json={"scope": "garbage", "ref_id": "anything"},
    )
    assert r_bad_scope.status_code == 400

    # Valid scope, over quota.
    r_quota = client.post(
        "/ai/regenerate",
        headers=auth,
        json={"scope": "summary", "ref_id": "sub-1"},
    )
    assert r_quota.status_code == 429, r_quota.text
    assert "quota" in r_quota.json()["detail"].lower()


def test_quota_disabled_when_zero(monkeypatch):
    """STUDYPARTNER_AI_CALLS_PER_DAY=0 disables the quota entirely."""
    monkeypatch.setenv("STUDYPARTNER_AI_CALLS_PER_DAY", "0")
    _fresh_db()
    client = TestClient(app)
    token, uid = _register(client)
    auth = {"Authorization": f"Bearer {token}"}

    # Pile up plenty of calls.
    for _ in range(50):
        log_ai_call(uid, "summary", "claude-haiku-4-5")

    r = client.post(
        "/ai/regenerate",
        headers=auth,
        json={"scope": "summary", "ref_id": "sub-1"},
    )
    # No 429; either 200 (regenerate succeeded with empty cache) or 404
    # (subtopic not found). Both are acceptable — we just want NOT 429.
    assert r.status_code != 429


def test_stub_calls_do_not_count(monkeypatch):
    """A cache miss that fell back to the deterministic stub should not
    consume the user's quota."""
    monkeypatch.delenv("STUDYPARTNER_LLM_BACKEND", raising=False)
    _fresh_db()
    client = TestClient(app)
    _, uid = _register(client)

    from app.src.models.services import ai_service

    # Fake selection with one subtopic ref. Just exercise the _cached
    # path with stub backend (default when STUDYPARTNER_LLM_BACKEND is
    # unset).
    from app.src.models import (
        AIFeatureSet,
        Module,
        ModuleType,
        Subtopic,
        UserSelection,
    )
    from app.storage import add_module, insert_learning_unit, insert_subtopic

    add_module(Module(id="m-1", user_id=uid, name="m", module_type=ModuleType.semester))
    from app.src.models import LearningUnit

    lu = LearningUnit(id="lu-1", module_id="m-1", ordinal=1, topic="t")
    insert_learning_unit(lu)
    sub = Subtopic(
        id="sub-1",
        learning_unit_id="lu-1",
        ordinal=1,
        title="x",
        content="word " * 200,
        word_count=200,
        effort_score=1.0,
    )
    insert_subtopic(sub)
    selection = UserSelection(
        id="sel-1",
        user_id=uid,
        module_id="m-1",
        subtopic_ids=["sub-1"],
        ai_features=AIFeatureSet(summaries=True, subtopic_quiz=True, topic_quiz=True),
        updated_at=utcnow_aware(),
    )

    svc = ai_service.AIService()
    svc.generate_summary(sub, selection)

    since = "2000-01-01T00:00:00+00:00"
    assert count_ai_calls_since(uid, since) == 0, "stub call should not log to quota"
