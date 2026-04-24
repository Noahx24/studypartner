"""End-to-end tests for the offline-first pipeline:
ingest → structure → selection → plan → pack.
"""
from __future__ import annotations

from app.src.utils.time import utcnow_aware
import gzip
import json
import uuid

from app.src.models import AIFeatureSet, ModuleType, Pace, User, UserSelection
from app.src.models.services.ai_service import AIService
from app.src.models.services.content_analysis_service import detect_learning_units, normalize_structure
from app.src.models.services.ingestion_service import ingest_upload, normalize_preserving_lines
from app.src.models.services.planning_service import compute_plan_from_subtopics
from app.src.models.services.study_pack_service import build_pack, new_pack
from app.storage import (
    DB_PATH,
    create_user,
    get_learning_units_for_module,
    get_pack,
    init_db,
    upsert_selection,
)


SAMPLE = """CHAPTER 1: INTRODUCTION

1.1 Definitions
A subject is defined by its axioms and postulates. The axiomatic approach ensures consistency.
Each axiom can be used to derive further theorems. The process of derivation proceeds by logical inference.

1.2 Principles
The main principles include consistency, completeness, and soundness. These principles are foundational.
They guide the entire development of the subject matter.

CHAPTER 2: METHODS

2.1 Axiomatic method
The axiomatic method proceeds by stating axioms first. Then theorems are deduced.
This is the cornerstone of modern mathematics.

2.2 Constructive method
The constructive method builds objects explicitly. Unlike pure existence proofs, constructive methods
give an algorithm for producing the object.
"""


def _fresh_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


def test_structural_parser_detects_chapters_and_subtopics():
    text = normalize_preserving_lines(SAMPLE)
    lus = normalize_structure(detect_learning_units("m1", text))
    assert len(lus) == 2
    assert lus[0].topic == "INTRODUCTION"
    assert lus[1].topic == "METHODS"
    assert [s.title for s in lus[0].subtopics] == ["Definitions", "Principles"]
    assert all(s.effort_score > 0 for lu in lus for s in lu.subtopics)


def test_ingest_upload_populates_both_pipelines():
    _fresh_db()
    user = User(id="u1", name="A", email="a@x.com", hours_per_day=2, days_per_week=5, pace=Pace.normal, max_daily_hours=2)
    create_user(user)

    result = ingest_upload(user, "m1", "Module 1", ModuleType.semester, "sample.txt", SAMPLE.encode())
    assert result["learning_unit_count"] == 2
    assert result["subtopic_count"] == 4
    assert result["unit_count"] >= 1  # legacy pipeline still populated

    lus = get_learning_units_for_module("m1")
    assert {lu.topic for lu in lus} == {"INTRODUCTION", "METHODS"}


def test_plan_is_unit_continuous():
    _fresh_db()
    user = User(id="u1", name="A", email="a@x.com", hours_per_day=1, days_per_week=7, pace=Pace.normal, max_daily_hours=1)
    create_user(user)
    ingest_upload(user, "m1", "Module 1", ModuleType.semester, "sample.txt", SAMPLE.encode())

    lus = get_learning_units_for_module("m1")
    selected_ids = {s.id for lu in lus for s in lu.subtopics}

    plan = compute_plan_from_subtopics(user, "m1", lus, selected_ids)

    # INVARIANT: once we move to a new learning unit, we never return to a previous one.
    seen_order: list[str] = []
    for entry in plan:
        lu_id = entry["learning_unit_id"]
        if not seen_order or seen_order[-1] != lu_id:
            seen_order.append(lu_id)
    assert seen_order == sorted(set(seen_order), key=seen_order.index)
    assert len(set(seen_order)) == len(seen_order), "LU appears non-contiguously"


def test_pack_generation_end_to_end_and_cached():
    _fresh_db()
    user = User(id="u1", name="A", email="a@x.com", hours_per_day=2, days_per_week=5, pace=Pace.normal, max_daily_hours=2)
    create_user(user)
    ingest_upload(user, "m1", "Module 1", ModuleType.semester, "sample.txt", SAMPLE.encode())

    lus = get_learning_units_for_module("m1")
    sub_ids = [s.id for lu in lus for s in lu.subtopics]
    selection = UserSelection(
        id=str(uuid.uuid4()),
        user_id="u1",
        module_id="m1",
        subtopic_ids=sub_ids,
        ai_features=AIFeatureSet(),
        low_data_mode=False,
        updated_at=utcnow_aware(),
    )
    upsert_selection(selection)

    pack = new_pack(user_id="u1", selection_id=selection.id)
    build_pack(pack.id)
    final = get_pack(pack.id)
    assert final is not None
    assert final.status.value == "generated"
    assert final.payload and final.byte_size and final.byte_size > 0

    payload = json.loads(gzip.decompress(final.payload).decode("utf-8"))
    assert len(payload["learning_units"]) == 2
    for lu in payload["learning_units"]:
        assert lu["topic_quiz"] is not None
        for s in lu["subtopics"]:
            assert s["summary"] is not None
            assert s["quiz"] is not None
    assert payload["study_plan"], "pack should include study plan slice"


def test_ai_gating_respects_selection():
    _fresh_db()
    user = User(id="u1", name="A", email="a@x.com", hours_per_day=1, days_per_week=5, pace=Pace.normal, max_daily_hours=1)
    create_user(user)
    ingest_upload(user, "m1", "Module 1", ModuleType.semester, "sample.txt", SAMPLE.encode())
    lus = get_learning_units_for_module("m1")
    some_sub = lus[0].subtopics[0]

    sel_no_summaries = UserSelection(
        id="sel-no-sum",
        user_id="u1",
        module_id="m1",
        subtopic_ids=[some_sub.id],
        ai_features=AIFeatureSet(summaries=False, subtopic_quiz=True, topic_quiz=False),
        low_data_mode=False,
        updated_at=utcnow_aware(),
    )
    svc = AIService()
    try:
        svc.generate_summary(some_sub, sel_no_summaries)
        raise AssertionError("should have raised PermissionError")
    except PermissionError:
        pass

    # Allowed scope works
    out = svc.generate_subtopic_quiz(some_sub, sel_no_summaries)
    assert "questions" in out

    # Cache hit: second call returns same payload object shape, no LLM call counted
    out2 = svc.generate_subtopic_quiz(some_sub, sel_no_summaries)
    assert out == out2
