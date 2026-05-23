"""Idempotency-Key header on /pack/generate.

A retry with the same key inside the TTL must return the original
pack_id rather than mint a fresh one — clients on flaky networks
shouldn't pay for duplicate background builds.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.src.models import Module, ModuleType, UserSelection, AIFeatureSet
from app.storage import (
    DB_PATH,
    add_module,
    get_idempotency_response,
    init_db,
    save_idempotency_response,
    upsert_selection,
)


def _fresh_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client):
    r = client.post(
        "/users/register",
        json={"name": "x", "email": "i@x.test", "password": "longenoughpw1!"},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user_id"]


def _make_selection(user_id):
    add_module(Module(id="m-i", user_id=user_id, name="m", module_type=ModuleType.semester))
    sel = UserSelection(
        id="sel-i",
        user_id=user_id,
        module_id="m-i",
        subtopic_ids=[],
        ai_features=AIFeatureSet(summaries=True, subtopic_quiz=True, topic_quiz=True),
        updated_at=datetime.now(timezone.utc),
    )
    upsert_selection(sel)
    return sel


def test_storage_idempotency_roundtrip():
    _fresh_db()
    now = datetime.now(timezone.utc)
    later = now + timedelta(hours=24)
    assert get_idempotency_response("u1", "k1", now.isoformat()) is None
    save_idempotency_response("u1", "k1", "pack-A", now.isoformat(), later.isoformat())
    assert get_idempotency_response("u1", "k1", now.isoformat()) == "pack-A"


def test_storage_idempotency_expires():
    _fresh_db()
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(hours=25)
    save_idempotency_response(
        "u1", "k-expired", "pack-old", yesterday.isoformat(), (yesterday + timedelta(hours=24)).isoformat()
    )
    # Lookup at "now" → past TTL → None.
    assert get_idempotency_response("u1", "k-expired", now.isoformat()) is None


def test_storage_idempotency_per_user_scope():
    """Keys are scoped per user — same key from a different user gets
    a different pack."""
    _fresh_db()
    now = datetime.now(timezone.utc)
    later = now + timedelta(hours=24)
    save_idempotency_response("u1", "shared", "pack-A", now.isoformat(), later.isoformat())
    save_idempotency_response("u2", "shared", "pack-B", now.isoformat(), later.isoformat())
    assert get_idempotency_response("u1", "shared", now.isoformat()) == "pack-A"
    assert get_idempotency_response("u2", "shared", now.isoformat()) == "pack-B"


def test_pack_generate_returns_same_id_on_replay():
    _fresh_db()
    client = TestClient(app)
    token, uid = _register(client)
    _make_selection(uid)
    auth = {"Authorization": f"Bearer {token}", "Idempotency-Key": "client-uuid-1"}

    first = client.post(
        "/pack/generate",
        headers=auth,
        json={"selection_id": "sel-i", "user_id": uid},
    )
    assert first.status_code == 200, first.text
    pack_id = first.json()["pack_id"]

    second = client.post(
        "/pack/generate",
        headers=auth,
        json={"selection_id": "sel-i", "user_id": uid},
    )
    assert second.status_code == 200
    assert second.json()["pack_id"] == pack_id
    assert second.json().get("idempotent_replay") is True


def test_pack_generate_different_keys_mint_different_packs():
    _fresh_db()
    client = TestClient(app)
    token, uid = _register(client)
    _make_selection(uid)

    a = client.post(
        "/pack/generate",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "key-A"},
        json={"selection_id": "sel-i", "user_id": uid},
    ).json()
    b = client.post(
        "/pack/generate",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "key-B"},
        json={"selection_id": "sel-i", "user_id": uid},
    ).json()
    assert a["pack_id"] != b["pack_id"]


def test_pack_generate_no_key_always_mints_fresh():
    _fresh_db()
    client = TestClient(app)
    token, uid = _register(client)
    _make_selection(uid)
    auth = {"Authorization": f"Bearer {token}"}

    a = client.post("/pack/generate", headers=auth, json={"selection_id": "sel-i", "user_id": uid}).json()
    b = client.post("/pack/generate", headers=auth, json={"selection_id": "sel-i", "user_id": uid}).json()
    assert a["pack_id"] != b["pack_id"]
