from __future__ import annotations

from datetime import date
import re

from app.models import Module, ModuleType, Pace, StudyTopic, User
from app.services.planning_service import content_to_units
from app.storage import add_module, get_user_multiplier, replace_topics_and_units, save_upload


def clean_text(raw_text: str) -> str:
    return re.sub(r"\s+", " ", raw_text.replace("\x00", " ")).strip()


def extract_text(filename: str, content: bytes) -> tuple[str, int | None]:
    lower = filename.lower()
    if lower.endswith(".txt"):
        return clean_text(content.decode("utf-8", errors="ignore")), None
    if lower.endswith(".pdf"):
        decoded = content.decode("latin-1", errors="ignore")
        lines = [line.strip() for line in decoded.splitlines() if re.search(r"[A-Za-z]{3,}", line)]
        return clean_text("\n".join(lines)), content.count(b"/Type /Page") or None
    raise ValueError("Unsupported file type. Supported: .pdf, .txt")


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


def upload_and_ingest(
    user: User,
    module_id: str,
    module_name: str,
    module_type: ModuleType,
    filename: str,
    file_content: bytes,
    pasted_text: str | None = None,
) -> dict:
    if pasted_text and pasted_text.strip():
        raw_text = clean_text(pasted_text)
        page_count = None
        filepath = "pasted_text"
    else:
        raw_text, page_count = extract_text(filename, file_content)
        filepath = save_upload(user.id, module_id, filename, file_content, raw_text, page_count)

    add_module(Module(id=module_id, user_id=user.id, name=module_name, module_type=module_type))
    topics = parse_topics(module_id, raw_text)
    multiplier, _ = get_user_multiplier(user.id)
    units = content_to_units(module_id, raw_text, user.pace, user.custom_minutes_per_500_words, multiplier)
    replace_topics_and_units(module_id, topics, units)

    return {
        "module_id": module_id,
        "filepath": filepath,
        "page_count": page_count,
        "topic_count": len(topics),
        "unit_count": len(units),
    }
