"""Content ingestion for Moodle and Upload paths.

Produces the SAME internal format (LearningUnit + Subtopic tree) regardless
of source. Also retains the legacy StudyTopic/StudyUnit path for backward
compatibility with the planner and existing tests.
"""
from __future__ import annotations

from datetime import date
import re

from app.src.models import LearningUnit, Module, ModuleType, Pace, StudyTopic, User
from app.src.models.services.content_analysis_service import (
    detect_learning_units,
    normalize_structure,
)
from app.src.models.services.planning_service import content_to_units
from app.storage import (
    add_module,
    get_user_multiplier,
    replace_learning_units,
    replace_topics_and_units,
    save_upload,
)


# ---- Text cleaning / extraction ----

def clean_text(raw_text: str) -> str:
    """Legacy: collapses ALL whitespace to single spaces. Kept for the legacy
    topic/unit path. The structural parser uses `normalize_preserving_lines`."""
    return re.sub(r"\s+", " ", raw_text.replace("\x00", " ")).strip()


def normalize_preserving_lines(raw_text: str) -> str:
    """Normalize horizontal whitespace but preserve line breaks and paragraph
    boundaries. Required by the deterministic LU/subtopic parser."""
    no_null = raw_text.replace("\x00", " ")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in no_null.splitlines()]
    collapsed = "\n".join(lines)
    # Collapse 3+ blank lines to exactly two (one blank line between paragraphs)
    return re.sub(r"\n{3,}", "\n\n", collapsed).strip()


def _extract_pdf(content: bytes) -> tuple[str, int | None]:
    """Try pypdf for clean extraction; fall back to latin-1 heuristic."""
    try:
        from pypdf import PdfReader  # type: ignore
        import io

        reader = PdfReader(io.BytesIO(content))
        pages = [p.extract_text() or "" for p in reader.pages]
        return normalize_preserving_lines("\n\n".join(pages)), len(reader.pages)
    except Exception:
        decoded = content.decode("latin-1", errors="ignore")
        lines = [line.strip() for line in decoded.splitlines() if re.search(r"[A-Za-z]{3,}", line)]
        page_count = content.count(b"/Type /Page") or None
        return normalize_preserving_lines("\n".join(lines)), page_count


def _extract_docx(content: bytes) -> tuple[str, int | None]:
    """Try python-docx; fall back to raw-text scan of the zip."""
    try:
        from docx import Document  # type: ignore
        import io

        doc = Document(io.BytesIO(content))
        text = "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return normalize_preserving_lines(text), None
    except Exception:
        import zipfile
        import io

        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                with zf.open("word/document.xml") as f:
                    raw = f.read().decode("utf-8", errors="ignore")
            # Preserve paragraph breaks by converting closing </w:p> to newline
            with_breaks = re.sub(r"</w:p\s*>", "\n\n", raw)
            stripped = re.sub(r"<[^>]+>", " ", with_breaks)
            return normalize_preserving_lines(stripped), None
        except Exception as exc:
            raise ValueError("Unable to read DOCX (install python-docx)") from exc


def extract_text(filename: str, content: bytes) -> tuple[str, int | None]:
    lower = filename.lower()
    if lower.endswith(".txt"):
        return normalize_preserving_lines(content.decode("utf-8", errors="ignore")), None
    if lower.endswith(".pdf"):
        return _extract_pdf(content)
    if lower.endswith(".docx"):
        return _extract_docx(content)
    raise ValueError("Unsupported file type. Supported: .pdf, .docx, .txt")


# ---- Legacy topic parsing (kept for backward compat with tests / old planner path) ----

def parse_topics(module_id: str, raw_text: str) -> list[StudyTopic]:
    sections = [s.strip() for s in re.split(r"\n(?=[A-Z][A-Z\s\d:]{3,}|\d+\.\s)", raw_text) if s.strip()] or [raw_text]
    topics: list[StudyTopic] = []
    for section in sections:
        words = re.findall(r"\w+", section)
        for i in range(0, len(words), 700):
            part = words[i : i + 700]
            if not part:
                continue
            topics.append(
                StudyTopic(
                    id=f"{module_id}-topic-{len(topics)+1}",
                    module_id=module_id,
                    title=f"Topic {len(topics)+1}",
                    content=" ".join(part),
                    word_count=len(part),
                    page_span=max(1, int(len(part) / 350)),
                )
            )
    return topics


# ---- Unified ingestion entry points ----

def ingest_upload(
    user: User,
    module_id: str,
    module_name: str,
    module_type: ModuleType,
    filename: str,
    file_content: bytes,
    pasted_text: str | None = None,
) -> dict:
    """PDF/DOCX/TXT upload path. Writes both:
      - New LearningUnit/Subtopic tree (for pack generation & selection UI)
      - Legacy StudyTopic/StudyUnit (for the existing planner & tests)
    """
    if pasted_text and pasted_text.strip():
        structured = normalize_preserving_lines(pasted_text)
        page_count = None
        filepath = "pasted_text"
    else:
        structured, page_count = extract_text(filename, file_content)
        filepath = save_upload(user.id, module_id, filename, file_content, structured, page_count)

    add_module(Module(id=module_id, user_id=user.id, name=module_name, module_type=module_type))

    # New pipeline — uses structure-preserving text
    learning_units = normalize_structure(detect_learning_units(module_id, structured))
    replace_learning_units(module_id, learning_units)

    # Legacy pipeline — collapses whitespace for the word-based planner path
    legacy_text = clean_text(structured)
    topics = parse_topics(module_id, legacy_text)
    multiplier, _ = get_user_multiplier(user.id)
    units = content_to_units(module_id, legacy_text, user.pace, user.custom_minutes_per_500_words, multiplier)
    replace_topics_and_units(module_id, topics, units)

    subtopic_count = sum(len(lu.subtopics) for lu in learning_units)
    return {
        "module_id": module_id,
        "filepath": filepath,
        "page_count": page_count,
        "learning_unit_count": len(learning_units),
        "subtopic_count": subtopic_count,
        "topic_count": len(topics),
        "unit_count": len(units),
    }


# Legacy alias — some callers/tests may use the old name
upload_and_ingest = ingest_upload


def ingest_moodle_resource(
    user: User,
    module_id: str,
    module_name: str,
    module_type: ModuleType,
    resource_title: str,
    resource_content: bytes,
    resource_filename: str,
) -> dict:
    """Moodle ingestion goes through the same unified pipeline."""
    return ingest_upload(
        user=user,
        module_id=module_id,
        module_name=module_name,
        module_type=module_type,
        filename=resource_filename,
        file_content=resource_content,
        pasted_text=None,
    )
