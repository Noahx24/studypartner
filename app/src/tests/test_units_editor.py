"""Tests for the parsed-unit editor: CRUD endpoints, ownership, recompute,
parsing feedback log, and the AI prompt's correction-aware preamble.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.src.models import (
    AIFeatureSet,
    LearningUnit,
    Module,
    ModuleType,
    Subtopic,
    UserSelection,
)
from app.src.models.services import ai_service
from app.src.utils.time import utcnow_aware
from app.storage import (
    DB_PATH,
    add_module,
    get_subtopic,
    init_db,
    list_parsing_feedback_for_module,
    list_recent_parsing_corrections,
    record_parsing_feedback,
    replace_learning_units,
)


def _fresh_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def _register(client: TestClient, email: str = "stu@example.com") -> tuple[str, str]:
    r = client.post(
        "/users/register",
        json={
            "name": "Stu",
            "email": email,
            "password": "correct-horse-battery-staple-1",
            "hours_per_day": 2,
            "days_per_week": 5,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["user_id"]


def _seed_module_and_unit(user_id: str) -> tuple[str, str]:
    """Create a module owned by user_id with one parsed unit + one subtopic.
    Returns (module_id, unit_id)."""
    add_module(Module(id="m1", user_id=user_id, name="Algorithms", module_type=ModuleType.semester))
    sub = Subtopic(
        id="m1-lu-1-s-1",
        learning_unit_id="m1-lu-1",
        ordinal=1,
        title="Big-O notation",
        content="Big-O describes upper bounds. " * 20,
        word_count=80,
        resource_weight=0.0,
        effort_score=0.16,
    )
    lu = LearningUnit(id="m1-lu-1", module_id="m1", ordinal=1, topic="Complexity", subtopics=[sub])
    replace_learning_units("m1", [lu])
    return "m1", "m1-lu-1"


def test_create_and_list_unit_appears_in_structure():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    add_module(Module(id="m1", user_id=user_id, name="X", module_type=ModuleType.semester))
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/modules/m1/learning-units", headers=headers, json={"topic": "Trees"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["topic"] == "Trees"
    assert body["ordinal"] == 1

    structure = client.get("/modules/m1/structure", headers=headers).json()
    titles = [lu["topic"] for lu in structure["learning_units"]]
    assert "Trees" in titles


def test_rename_unit_records_feedback():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    mod_id, unit_id = _seed_module_and_unit(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.patch(f"/learning-units/{unit_id}", headers=headers, json={"topic": "Time complexity"})
    assert r.status_code == 200
    assert r.json()["topic"] == "Time complexity"

    feedback = list_parsing_feedback_for_module(mod_id)
    kinds = [f["kind"] for f in feedback]
    assert "rename_unit" in kinds
    rename = next(f for f in feedback if f["kind"] == "rename_unit")
    assert rename["before"]["topic"] == "Complexity"
    assert rename["after"]["topic"] == "Time complexity"


def test_delete_unit_cascades_subtopics_and_logs_feedback():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    mod_id, unit_id = _seed_module_and_unit(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.delete(f"/learning-units/{unit_id}", headers=headers)
    assert r.status_code == 204

    structure = client.get(f"/modules/{mod_id}/structure", headers=headers).json()
    assert structure["learning_units"] == []
    # Subtopic must be cascaded
    assert get_subtopic("m1-lu-1-s-1") is None

    feedback = list_parsing_feedback_for_module(mod_id)
    assert any(f["kind"] == "delete_unit" for f in feedback)


def test_create_subtopic_recomputes_effort_from_word_count():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    _, unit_id = _seed_module_and_unit(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    long_body = "Quicksort uses divide-and-conquer. " * 100
    r = client.post(
        f"/learning-units/{unit_id}/subtopics",
        headers=headers,
        json={"title": "Quicksort", "content": long_body},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "Quicksort"
    # effort_score = word_count/500 + resource_weight (= 0 here)
    assert body["word_count"] > 200
    assert body["effort_score"] > 0.4


def test_update_subtopic_content_recomputes_word_count_and_effort():
    """The planner uses word_count + effort_score for time estimates;
    edits to content must be reflected so the next plan is accurate."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    mod_id, _ = _seed_module_and_unit(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    new_content = "A concise version. " * 5  # ~10 words → small effort
    r = client.patch(
        "/subtopics/m1-lu-1-s-1",
        headers=headers,
        json={"content": new_content},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["word_count"] < 30
    # Was 0.16, edit should recompute
    assert body["effort_score"] != 0.16

    feedback = list_parsing_feedback_for_module(mod_id)
    assert any(f["kind"] == "edit_subtopic_content" for f in feedback)


def test_user_cannot_edit_another_users_units():
    _fresh_db()
    client = TestClient(app)
    token_a, _ = _register(client, "a@example.com")
    _, uid_b = _register(client, "b@example.com")
    _, unit_id = _seed_module_and_unit(uid_b)

    r = client.patch(
        f"/learning-units/{unit_id}",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"topic": "hijacked"},
    )
    assert r.status_code == 403


def test_unauthenticated_endpoints_are_locked_down():
    _fresh_db()
    client = TestClient(app)
    assert client.post("/modules/m1/learning-units", json={"topic": "x"}).status_code == 401
    assert client.patch("/learning-units/u1", json={"topic": "x"}).status_code == 401
    assert client.delete("/learning-units/u1").status_code == 401
    assert client.post("/learning-units/u1/subtopics", json={"title": "x"}).status_code == 401
    assert client.patch("/subtopics/s1", json={"title": "x"}).status_code == 401
    assert client.delete("/subtopics/s1").status_code == 401


def test_create_unit_requires_existing_module():
    _fresh_db()
    client = TestClient(app)
    token, _ = _register(client)
    r = client.post(
        "/modules/does-not-exist/learning-units",
        headers={"Authorization": f"Bearer {token}"},
        json={"topic": "x"},
    )
    assert r.status_code == 404


def test_patch_with_no_fields_returns_400():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    _, unit_id = _seed_module_and_unit(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    # Pydantic will reject completely empty bodies for PATCH that has all
    # optional fields ONLY if at least one is allowed; we explicitly 400
    # in the route. Mass an empty JSON {} and assert.
    r = client.patch(f"/learning-units/{unit_id}", headers=headers, json={})
    assert r.status_code == 400


def test_parsing_feedback_endpoint_returns_full_audit_log():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    mod_id, unit_id = _seed_module_and_unit(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    client.patch(f"/learning-units/{unit_id}", headers=headers, json={"topic": "Renamed"})
    client.patch(
        "/subtopics/m1-lu-1-s-1",
        headers=headers,
        json={"title": "Big-O"},
    )

    log = client.get(f"/modules/{mod_id}/parsing-feedback", headers=headers).json()
    kinds = [f["kind"] for f in log["feedback"]]
    assert "rename_unit" in kinds and "rename_subtopic" in kinds


def test_ai_prompt_includes_recent_user_corrections(monkeypatch):
    """The "feedback improves AI accuracy" loop: after the user renames a
    subtopic, that rename is fed into the next AI prompt as a few-shot
    correction. The correction is also folded into the cache key so we
    don't serve a pre-correction artifact."""
    _fresh_db()
    user_id = "u1"
    module_id = "m1"

    # Seed two corrections for this module
    record_parsing_feedback(
        user_id, module_id, kind="rename_subtopic",
        target_id="s-old", before={"title": "Big-O"}, after={"title": "Asymptotic Big-O"},
    )
    record_parsing_feedback(
        user_id, module_id, kind="rename_unit",
        target_id="lu-old", before={"topic": "Complexity"}, after={"topic": "Time Complexity"},
    )

    captured: dict = {}

    def fake_llm(prompt: str, max_tokens: int) -> str:
        captured["prompt"] = prompt
        import json as _json
        return _json.dumps({"key_concepts": ["x"], "bullets": ["y"], "simple_explanation": "z"})

    service = ai_service.AIService(llm=fake_llm, model="fake-llm")

    sub = Subtopic(
        id="s-1",
        learning_unit_id="lu-1",
        ordinal=1,
        title="Asymptotic Big-O",
        content="Big-O describes upper bounds.",
        word_count=10,
    )
    selection = UserSelection(
        id="sel-1",
        user_id=user_id,
        module_id=module_id,
        subtopic_ids=["s-1"],
        ai_features=AIFeatureSet(),
        updated_at=utcnow_aware(),
    )

    service.generate_summary(sub, selection)
    assert "Asymptotic Big-O" in captured["prompt"]
    assert "Time Complexity" in captured["prompt"]
    assert "user corrections" in captured["prompt"].lower()


def test_recent_corrections_is_module_scoped():
    """Corrections from another module must NOT leak into this module's
    AI prompt. Ground truth: list_recent_parsing_corrections filters by
    module_id."""
    _fresh_db()
    record_parsing_feedback("u1", "m-other", kind="rename_unit",
                            target_id="x", before={"topic": "A"}, after={"topic": "B"})
    record_parsing_feedback("u1", "m-this", kind="rename_subtopic",
                            target_id="y", before={"title": "C"}, after={"title": "D"})
    out = list_recent_parsing_corrections("u1", "m-this", limit=10)
    assert len(out) == 1
    assert out[0]["after"]["title"] == "D"


# ---- Reorder ----

def _seed_three_units(user_id: str) -> tuple[str, list[str]]:
    add_module(Module(id="m1", user_id=user_id, name="X", module_type=ModuleType.semester))
    units = [
        LearningUnit(id="m1-lu-1", module_id="m1", ordinal=1, topic="A"),
        LearningUnit(id="m1-lu-2", module_id="m1", ordinal=2, topic="B"),
        LearningUnit(id="m1-lu-3", module_id="m1", ordinal=3, topic="C"),
    ]
    replace_learning_units("m1", units)
    return "m1", ["m1-lu-1", "m1-lu-2", "m1-lu-3"]


def _ordinals(client: TestClient, headers: dict, module_id: str) -> list[tuple[str, int]]:
    structure = client.get(f"/modules/{module_id}/structure", headers=headers).json()
    return [(lu["topic"], lu["ordinal"]) for lu in structure["learning_units"]]


def test_reorder_unit_moving_down_does_not_500_on_unique_collision():
    """Without atomic reorder, PATCH {ordinal: 1} on unit B (currently
    ord=2) collides with `UNIQUE(module_id, ordinal)` on unit A (ord=1)
    and SQLite raises IntegrityError → FastAPI 500. With the fix, the
    move succeeds and ordinals are renumbered contiguously."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    _, [_, b, _] = _seed_three_units(user_id)

    r = client.patch(f"/learning-units/{b}", headers=headers, json={"ordinal": 1})
    assert r.status_code == 200, r.text
    assert r.json()["ordinal"] == 1

    # Final state: B (now 1), A (was 1, bumped to 2), C (still 3)
    assert _ordinals(client, headers, "m1") == [("B", 1), ("A", 2), ("C", 3)]


def test_reorder_unit_moving_up_renumbers_correctly():
    """Moving the first unit to position 3 should push the others up."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    _, [a, _, _] = _seed_three_units(user_id)

    r = client.patch(f"/learning-units/{a}", headers=headers, json={"ordinal": 3})
    assert r.status_code == 200, r.text
    assert r.json()["ordinal"] == 3
    assert _ordinals(client, headers, "m1") == [("B", 1), ("C", 2), ("A", 3)]


def test_reorder_unit_clamps_out_of_range():
    """Drag-to-end (ordinal=99) should clamp to N rather than 4xx."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    _, [a, _, _] = _seed_three_units(user_id)

    r = client.patch(f"/learning-units/{a}", headers=headers, json={"ordinal": 99})
    assert r.status_code == 200
    assert r.json()["ordinal"] == 3


def test_reorder_unit_noop_when_same_position():
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    _, [_, b, _] = _seed_three_units(user_id)

    r = client.patch(f"/learning-units/{b}", headers=headers, json={"ordinal": 2})
    assert r.status_code == 200
    assert _ordinals(client, headers, "m1") == [("A", 1), ("B", 2), ("C", 3)]


def test_reorder_subtopic_handles_unique_collision():
    """Same fix applies to subtopics' UNIQUE(learning_unit_id, ordinal)."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    add_module(Module(id="m1", user_id=user_id, name="X", module_type=ModuleType.semester))
    subs = [
        Subtopic(id="s-1", learning_unit_id="lu-1", ordinal=1, title="One",   content="x", word_count=1),
        Subtopic(id="s-2", learning_unit_id="lu-1", ordinal=2, title="Two",   content="x", word_count=1),
        Subtopic(id="s-3", learning_unit_id="lu-1", ordinal=3, title="Three", content="x", word_count=1),
    ]
    lu = LearningUnit(id="lu-1", module_id="m1", ordinal=1, topic="X", subtopics=subs)
    replace_learning_units("m1", [lu])

    r = client.patch("/subtopics/s-3", headers=headers, json={"ordinal": 1})
    assert r.status_code == 200, r.text
    assert r.json()["ordinal"] == 1
    structure = client.get("/modules/m1/structure", headers=headers).json()
    titles_in_order = [s["title"] for s in structure["learning_units"][0]["subtopics"]]
    assert titles_in_order == ["Three", "One", "Two"]


def test_reorder_does_not_leak_across_modules():
    """A unit in module A reordered to ordinal 1 must not collide with
    or shift units in a different module that share ordinals."""
    _fresh_db()
    client = TestClient(app)
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    add_module(Module(id="m1", user_id=user_id, name="A", module_type=ModuleType.semester))
    add_module(Module(id="m2", user_id=user_id, name="B", module_type=ModuleType.semester))
    replace_learning_units("m1", [
        LearningUnit(id="m1-1", module_id="m1", ordinal=1, topic="m1-A"),
        LearningUnit(id="m1-2", module_id="m1", ordinal=2, topic="m1-B"),
    ])
    replace_learning_units("m2", [
        LearningUnit(id="m2-1", module_id="m2", ordinal=1, topic="m2-A"),
        LearningUnit(id="m2-2", module_id="m2", ordinal=2, topic="m2-B"),
    ])

    r = client.patch("/learning-units/m1-2", headers=headers, json={"ordinal": 1})
    assert r.status_code == 200

    assert _ordinals(client, headers, "m1") == [("m1-B", 1), ("m1-A", 2)]
    # m2 unchanged
    assert _ordinals(client, headers, "m2") == [("m2-A", 1), ("m2-B", 2)]
