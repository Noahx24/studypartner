"""Study pack generation — on-demand, fully materialised, gzip-shipped offline.

Flow:
  build_pack(selection_id) → runs synchronously in a FastAPI BackgroundTask.
  Pack status: not_generated → generating → generated | failed
  Once generated, `GET /pack/{id}/download` streams the gzipped JSON blob.
"""
from __future__ import annotations

from app.src.utils.time import utcnow_iso
import gzip
import json
import logging
import uuid

logger = logging.getLogger(__name__)

from app.src.models import (
    PackStatus,
    StudyPack,
    UserSelection,
)
from app.src.models.services.ai_service import AIService
from app.src.models.services.planning_service import compute_plan_from_subtopics
from app.storage import (
    create_pack,
    get_learning_units_for_module,
    get_modules,
    get_pack,
    get_selection,
    get_subtopics_by_ids,
    get_user,
    update_pack,
)


def new_pack(user_id: str, selection_id: str) -> StudyPack:
    selection = get_selection(selection_id)
    if not selection:
        raise ValueError(f"Selection {selection_id} not found")

    pack = StudyPack(
        id=str(uuid.uuid4()),
        module_id=selection.module_id,
        user_id=user_id,
        selection_id=selection_id,
        status=PackStatus.generating,
        generated_at=None,
    )
    create_pack(pack)
    return pack


def build_pack(pack_id: str, *, ai_service: AIService | None = None) -> None:
    """Long-running build. Caller wraps in a BackgroundTask."""
    svc = ai_service or AIService()
    pack = get_pack(pack_id)
    if not pack:
        return

    try:
        selection = get_selection(pack.selection_id)
        if not selection:
            raise ValueError("selection missing")

        module = next((m for m in get_modules(selection.user_id) if m.id == selection.module_id), None)
        module_name = module.name if module else selection.module_id

        lus = get_learning_units_for_module(selection.module_id)
        selected_ids = set(selection.subtopic_ids)

        result: dict = {
            "module_id": selection.module_id,
            "module_name": module_name,
            "version": pack.version,
            "generated_at": utcnow_iso(),
            "low_data_mode": selection.low_data_mode,
            "learning_units": [],
        }

        for lu in lus:
            selected_subs = [s for s in lu.subtopics if s.id in selected_ids]
            if not selected_subs:
                continue

            lu_obj: dict = {
                "id": lu.id,
                "ordinal": lu.ordinal,
                "topic": lu.topic,
                "subtopics": [],
                "topic_quiz": None,
            }

            for sub in selected_subs:
                sub_obj: dict = {
                    "id": sub.id,
                    "ordinal": sub.ordinal,
                    "title": sub.title,
                    "word_count": sub.word_count,
                    "effort_score": sub.effort_score,
                    "summary": None,
                    "quiz": None,
                }
                if selection.ai_features.summaries:
                    sub_obj["summary"] = svc.generate_summary(sub, selection)
                if selection.ai_features.subtopic_quiz:
                    sub_obj["quiz"] = svc.generate_subtopic_quiz(sub, selection)
                lu_obj["subtopics"].append(sub_obj)

            if selection.ai_features.topic_quiz:
                # Ensure the LU object passed to AI only contains selected subs
                narrowed = type(lu)(
                    id=lu.id,
                    module_id=lu.module_id,
                    ordinal=lu.ordinal,
                    topic=lu.topic,
                    subtopics=selected_subs,
                    source_span=lu.source_span,
                )
                lu_obj["topic_quiz"] = svc.generate_topic_quiz(narrowed, selection)

            result["learning_units"].append(lu_obj)

        # Attach the study plan slice for this module
        user = get_user(selection.user_id)
        if user:
            selected_subs_all = get_subtopics_by_ids(selection.subtopic_ids)
            result["study_plan"] = compute_plan_from_subtopics(
                user=user,
                module_id=selection.module_id,
                learning_units=lus,
                selected_subtopic_ids=selected_ids,
            )

        payload_bytes = gzip.compress(json.dumps(result).encode("utf-8"))
        update_pack(pack_id, status=PackStatus.generated, payload=payload_bytes)

    except Exception as exc:
        logger.error("Pack build failed for %s: %s", pack_id, exc, exc_info=True)
        update_pack(pack_id, status=PackStatus.failed, error=str(exc))


def regenerate_artifact(pack_id: str, scope: str, ref_id: str) -> dict:
    """Drop the cached artifact for (scope, ref_id) and rebuild the pack.

    Scope must be one of: summary, subtopic_quiz, topic_quiz.

    Wraps in a try/except so FastAPI's BackgroundTasks runner never
    drops a silent failure on the floor — instead we mark the pack as
    failed with the error string, the frontend polls pack status and
    surfaces "regenerate failed" to the user.
    """
    if scope not in {"summary", "subtopic_quiz", "topic_quiz"}:
        raise ValueError("Invalid scope")
    try:
        svc = AIService()
        svc.regenerate(scope, ref_id)
        update_pack(pack_id, status=PackStatus.generating)
        build_pack(pack_id, ai_service=svc)
    except Exception as exc:
        logger.error("regenerate_artifact failed for %s/%s/%s: %s", pack_id, scope, ref_id, exc, exc_info=True)
        update_pack(pack_id, status=PackStatus.failed, error=f"regenerate failed: {exc}")
    return {"pack_id": pack_id, "regenerated": {"scope": scope, "ref_id": ref_id}}
