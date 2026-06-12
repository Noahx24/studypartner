"""Tests for the Moodle mobile-launch flow and per-file material selection.

The launch flow looks like:
    1. POST /moodle/launch     → returns { launch_url, passport }
    2. (browser visits launch_url, signs in via SSO, Moodle redirects
        back to the urlscheme with `token=<base64>`)
    3. POST /moodle/launch/callback { passport, token }
       → backend decodes blob, verifies signature, stores WS token

We don't have a real Moodle to talk to, so the integration is exercised
by monkey-patching `_ws_call` to return a stubbed site-info response.
"""
from __future__ import annotations

import base64
import hashlib

from fastapi.testclient import TestClient

from app.main import app
from app.src.models import Module, ModuleType, MoodleResource
from app.src.models.services import moodle_service
from app.storage import (
    DB_PATH,
    add_module,
    init_db,
    list_moodle_resources_with_selection,
    upsert_moodle_resources,
)


def _fresh_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client: TestClient, email: str = "10520467@mylife.unisa.ac.za") -> tuple[str, str]:
    r = client.post(
        "/users/register",
        json={
            "name": "Test Student",
            "email": email,
            "password": "correct-horse-battery-staple-1",
            "hours_per_day": 2,
            "days_per_week": 5,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["user_id"]


def test_launch_returns_url_and_passport():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    r = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "urlscheme": "studypartner",
            "base_url": "https://lms.unisa.ac.za",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["passport"]
    assert body["launch_url"].startswith(
        "https://lms.unisa.ac.za/admin/tool/mobile/launch.php?"
    )
    assert body["passport"] in body["launch_url"]
    assert "service=moodle_mobile_app" in body["launch_url"]
    assert "urlscheme=studypartner" in body["launch_url"]


def test_launch_requires_base_url(monkeypatch):
    monkeypatch.delenv("STUDYPARTNER_MOODLE_BASE_URL", raising=False)
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    r = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={"urlscheme": "studypartner"},
    )
    assert r.status_code == 400


def test_launch_unauthenticated():
    _fresh_db()
    client = TestClient(app)
    r = client.post(
        "/moodle/launch",
        json={"urlscheme": "studypartner", "base_url": "https://x"},
    )
    assert r.status_code == 401


def test_launch_rejects_full_url_as_urlscheme():
    """Moodle's tool_mobile validates urlscheme as a bare RFC 3986 scheme
    name. We enforce the same rule at the API layer so callers get a
    clean 422 instead of round-tripping through Moodle to find out."""
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    r = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "urlscheme": "https://app.example.com/moodle/callback?",
            "base_url": "https://lms.unisa.ac.za",
        },
    )
    assert r.status_code == 422, r.text


def _build_moodle_token_blob(passport: str, site_url: str, ws_token: str) -> str:
    """Replicate Moodle's launch return format: base64(<sig>:::<token>:::)
    where sig = md5(wwwroot + passport). The wwwroot is the site URL, which
    the WS exposes as `siteurl` (Moodle's tool_mobile/launch.php signs with
    $CFG->wwwroot)."""
    sig = hashlib.md5(f"{site_url}{passport}".encode("utf-8")).hexdigest()
    raw = f"{sig}:::{ws_token}:::".encode("utf-8")
    return base64.b64encode(raw).decode("utf-8")


def test_launch_callback_full_round_trip(monkeypatch):
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)

    # Stub Moodle's WS so accept_launch_token can validate.
    def fake_ws(base_url, ws_tok, function, params=None):
        assert function == "core_webservice_get_site_info"
        return {
            "siteid": 1,
            "siteurl": "https://lms.unisa.ac.za",
            "userid": 1001,
            "sitename": "UniSA Moodle",
        }

    monkeypatch.setattr(moodle_service, "_ws_call", fake_ws)

    start = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "urlscheme": "studypartner",
            "base_url": "https://lms.unisa.ac.za",
        },
    ).json()
    passport = start["passport"]

    blob = _build_moodle_token_blob(passport, "https://lms.unisa.ac.za", "ws-token-abc")
    r = client.post(
        "/moodle/launch/callback",
        json={"passport": passport, "token": blob},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sitename"] == "UniSA Moodle"
    assert body["user_id"] == user_id


def test_launch_callback_rejects_bad_passport():
    _fresh_db()
    client = TestClient(app)
    blob = _build_moodle_token_blob("never-issued", "https://x", "ws-token")
    r = client.post(
        "/moodle/launch/callback",
        json={"passport": "never-issued-by-us", "token": blob},
    )
    assert r.status_code == 400
    assert "passport" in r.json()["detail"].lower()


def test_launch_callback_rejects_replay(monkeypatch):
    """Passport must be single-use."""
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    monkeypatch.setattr(
        moodle_service,
        "_ws_call",
        lambda *a, **k: {"siteid": 1, "siteurl": "https://x", "userid": 1, "sitename": "S"},
    )
    start = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={"urlscheme": "studypartner", "base_url": "https://x"},
    ).json()
    blob = _build_moodle_token_blob(start["passport"], "https://x", "ws-tok")
    payload = {"passport": start["passport"], "token": blob}
    first = client.post("/moodle/launch/callback", json=payload)
    second = client.post("/moodle/launch/callback", json=payload)
    assert first.status_code == 200
    assert second.status_code == 400


def test_launch_callback_rejects_signature_mismatch(monkeypatch):
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    monkeypatch.setattr(
        moodle_service,
        "_ws_call",
        lambda *a, **k: {"siteid": 1, "siteurl": "https://x", "userid": 1, "sitename": "S"},
    )
    start = client.post(
        "/moodle/launch",
        headers={"Authorization": f"Bearer {token}"},
        json={"urlscheme": "studypartner", "base_url": "https://x"},
    ).json()
    # Sign with the WRONG site URL — simulates a forged blob.
    bad_blob = _build_moodle_token_blob(start["passport"], "https://evil.example", "ws-tok")
    r = client.post(
        "/moodle/launch/callback",
        json={"passport": start["passport"], "token": bad_blob},
    )
    assert r.status_code == 400
    assert "signature" in r.json()["detail"].lower()


def test_materials_listing_and_selection_round_trip():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    add_module(Module(id="moodle-101", user_id=user_id, name="Comp Sci 101", module_type=ModuleType.semester))
    upsert_moodle_resources(
        [
            MoodleResource(id="r-1", module_id="moodle-101", title="Study guide.pdf", type="resource", file_size=1024, url="https://x/1"),
            MoodleResource(id="r-2", module_id="moodle-101", title="Tutorial letter.pdf", type="resource", file_size=512, url="https://x/2"),
        ]
    )

    listing = client.get("/moodle/materials", headers=headers)
    assert listing.status_code == 200
    rows = listing.json()["resources"]
    assert {r["id"] for r in rows} == {"r-1", "r-2"}
    assert all(r["included_in_ai"] is False for r in rows)
    assert rows[0]["module_name"] == "Comp Sci 101"

    sel = client.post(
        "/moodle/materials/select",
        headers=headers,
        json={"include": ["r-1"], "exclude": ["r-2"]},
    )
    assert sel.status_code == 200
    assert sel.json() == {"included": 1, "excluded": 1}

    after = {r["id"]: r for r in client.get("/moodle/materials", headers=headers).json()["resources"]}
    assert after["r-1"]["included_in_ai"] is True
    assert after["r-2"]["included_in_ai"] is False


def test_user_cannot_flip_other_users_resources():
    _fresh_db()
    client = TestClient(app)
    token_a, _ = _register(client, "stuA@mylife.unisa.ac.za")
    _, uid_b = _register(client, "stuB@mylife.unisa.ac.za")

    add_module(Module(id="m-b", user_id=uid_b, name="B's module", module_type=ModuleType.semester))
    upsert_moodle_resources([MoodleResource(id="r-b", module_id="m-b", title="x", type="resource")])

    r = client.post(
        "/moodle/materials/select",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"include": ["r-b"]},
    )
    assert r.status_code == 200
    assert r.json()["included"] == 0
    rows = list_moodle_resources_with_selection(uid_b)
    assert all(row["included_in_ai"] is False for row in rows)


def test_passport_consume_is_single_use_under_concurrency():
    """Two threads racing on the same passport must produce exactly one
    winner. The DELETE…RETURNING pattern relies on SQLite serializing
    writes; this regression test would have failed against the older
    SELECT-then-DELETE implementation, where both threads could read the
    row before either delete committed."""
    import threading
    from app.src.utils.time import utcnow_aware
    from app.storage import save_launch_passport, consume_launch_passport
    from datetime import timedelta

    _fresh_db()
    now = utcnow_aware()
    save_launch_passport("race-passport", "u1", "https://x", now, now + timedelta(minutes=5))

    results: list[object] = []
    barrier = threading.Barrier(8)

    def worker():
        barrier.wait()
        results.append(consume_launch_passport("race-passport", utcnow_aware()))

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    winners = [r for r in results if r is not None]
    losers = [r for r in results if r is None]
    assert len(winners) == 1, f"expected exactly one winner, got {winners}"
    assert len(losers) == 7
    assert winners[0] == ("u1", "https://x")


def test_ingest_filename_prefers_moodle_filename(monkeypatch):
    """Moodle's activity *title* is a display name with no extension —
    'Study Guide' won't be parseable. The ingestion path must pick a
    real filename (`study-guide.pdf`) from the resource so the parser
    knows which extractor to use."""
    from app.src.models.services import moodle_service
    from app.src.models.services.moodle_service import ingest_selected_materials
    from app.storage import (
        save_moodle_account,
    )
    from app.src.models import MoodleAccount

    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    add_module(Module(id="moodle-1", user_id=user_id, name="X", module_type=ModuleType.semester))
    upsert_moodle_resources([
        MoodleResource(
            id="r-pdf",
            module_id="moodle-1",
            title="Study Guide",  # no extension — common Moodle convention
            type="resource",
            file_size=10,
            url="https://lms.example.com/webservice/pluginfile.php/123/mod_resource/content/1/study-guide.pdf",
            filename="study-guide.pdf",
        ),
    ])
    client.post("/moodle/materials/select", headers=headers, json={"include": ["r-pdf"]})

    save_moodle_account(
        MoodleAccount(user_id=user_id, base_url="https://lms.example.com", token="ws-tok"),
        moodle_service.encrypt_token("ws-tok"),
    )

    captured = {}

    def fake_fetch(uid, url):
        # Tiny but valid-looking text content; ingestion accepts plain bytes
        # for any supported extension (parser falls back to latin-1).
        return b"Pretend PDF body. Lorem ipsum. " * 50

    def fake_ingest(*, user, module_id, module_name, module_type, resource_title, resource_content, resource_filename):
        captured["resource_filename"] = resource_filename
        captured["resource_title"] = resource_title
        return {"module_id": module_id, "filepath": "x", "page_count": None,
                "learning_unit_count": 1, "subtopic_count": 1,
                "topic_count": 1, "unit_count": 1}

    monkeypatch.setattr(moodle_service, "fetch_resource_bytes", fake_fetch)
    import app.src.models.services.ingestion_service as ingestion_module
    monkeypatch.setattr(ingestion_module, "ingest_moodle_resource", fake_ingest)
    # Re-import binding so ingest_selected_materials picks up the patched ref
    monkeypatch.setattr(
        "app.src.models.services.ingestion_service.ingest_moodle_resource",
        fake_ingest,
    )

    result = ingest_selected_materials(user_id)
    assert result["count"] == 1, result
    assert captured["resource_filename"] == "study-guide.pdf"
    assert captured["resource_title"] == "Study Guide"


def test_ingest_falls_back_to_url_when_filename_missing(monkeypatch):
    """Older sync data may not have the `filename` column populated.
    Fall back to the URL's last path segment so existing rows still work."""
    from app.src.models.services import moodle_service
    from app.src.models.services.moodle_service import _filename_for_ingest

    r = MoodleResource(
        id="r",
        module_id="m",
        title="Tutorial Letter 102",  # no extension
        type="resource",
        url="https://lms.example.com/webservice/pluginfile.php/9/mod_resource/content/1/TL102.docx?token=secret",
        filename=None,
    )
    assert _filename_for_ingest(r) == "TL102.docx"


def test_ingest_skips_unsupported_file_types(monkeypatch):
    """A Moodle resource pointing at an .mp4 has no parser — must skip
    cleanly with a reason instead of crashing the batch."""
    from app.src.models.services import moodle_service
    from app.src.models.services.moodle_service import ingest_selected_materials
    from app.storage import save_moodle_account
    from app.src.models import MoodleAccount

    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    add_module(Module(id="m", user_id=user_id, name="X", module_type=ModuleType.semester))
    upsert_moodle_resources([
        MoodleResource(
            id="r-vid",
            module_id="m",
            title="Lecture recording",
            type="resource",
            url="https://lms.example.com/pluginfile.php/1/mod_resource/content/1/lecture.mp4",
            filename="lecture.mp4",
        ),
    ])
    client.post("/moodle/materials/select", headers=headers, json={"include": ["r-vid"]})

    save_moodle_account(
        MoodleAccount(user_id=user_id, base_url="https://lms.example.com", token="ws-tok"),
        moodle_service.encrypt_token("ws-tok"),
    )

    result = ingest_selected_materials(user_id)
    assert result["count"] == 0
    assert any(s["id"] == "r-vid" and "unsupported" in s["reason"] for s in result["skipped"])


def test_resync_preserves_user_material_selection():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    add_module(Module(id="moodle-1", user_id=user_id, name="X", module_type=ModuleType.semester))
    upsert_moodle_resources(
        [MoodleResource(id="r-keep", module_id="moodle-1", title="Old title", type="resource", url="https://x/1")]
    )
    client.post("/moodle/materials/select", headers=headers, json={"include": ["r-keep"]})

    # Re-sync overwrites metadata but must NOT clobber the user's pick.
    upsert_moodle_resources(
        [MoodleResource(id="r-keep", module_id="moodle-1", title="Renamed", type="resource", url="https://x/1")]
    )
    rows = client.get("/moodle/materials", headers=headers).json()["resources"]
    keep = next(r for r in rows if r["id"] == "r-keep")
    assert keep["title"] == "Renamed"
    assert keep["included_in_ai"] is True
