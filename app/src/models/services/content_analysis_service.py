"""Structural analysis: learning-unit/subtopic detection and effort scoring.

Deterministic — no AI. Single pipeline for Moodle and Upload ingestion.
"""
from __future__ import annotations

from dataclasses import dataclass
import re

from app.src.models import LearningUnit, Subtopic


# Patterns are anchored at line start (multiline + case-insensitive).
LU_PATTERNS = [
    re.compile(r"^\s*CHAPTER\s+(\d+|[IVXLCDM]+)[\s:\.\-]+(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*UNIT\s+(\d+)[\s:\.\-]+(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*WEEK\s+(\d+)[\s:\.\-]+(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
    # Top-level numbering only (e.g. "1. Introduction"), not "1.1"
    re.compile(r"^\s*(\d+)\.\s+([A-Z][^\n]{3,80})$", re.MULTILINE),
]

SUBTOPIC_DOTTED = re.compile(r"^\s*(\d+)\.(\d+)(?:\.(\d+))?\s+(.+?)\s*$", re.MULTILINE)
# ALL CAPS or Title Case heading-like line, short
SUBTOPIC_HEADING = re.compile(r"^\s*([A-Z][A-Za-z0-9 \-]{3,60})\s*$", re.MULTILINE)
SUBTOPIC_BULLET = re.compile(r"^\s*[•\-\*]\s+(.{3,80})$", re.MULTILINE)

MIN_LU_WORDS = 25
MAX_TITLE_LEN = 80
FALLBACK_LU_CHUNK_WORDS = 2500
FALLBACK_SUB_CHUNK_WORDS = 700


@dataclass
class _Match:
    start: int
    end: int
    title: str
    ordinal_hint: int | None = None


def _word_count(text: str) -> int:
    return len(re.findall(r"\w+", text))


def _clean_title(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip().rstrip(":.-")


def _collect_lu_matches(text: str) -> list[_Match]:
    matches: list[_Match] = []
    for pat in LU_PATTERNS:
        for m in pat.finditer(text):
            title = _clean_title(m.group(2))
            if len(title) > MAX_TITLE_LEN or len(title) < 3:
                continue
            matches.append(_Match(start=m.start(), end=m.end(), title=title))
    matches.sort(key=lambda x: x.start)
    # Dedupe overlapping matches (keep first)
    deduped: list[_Match] = []
    for m in matches:
        if deduped and m.start < deduped[-1].end + 5:
            continue
        deduped.append(m)
    return deduped


def _slice_between(text: str, matches: list[_Match]) -> list[tuple[str, str, dict]]:
    """Return [(title, body, source_span), ...]"""
    out: list[tuple[str, str, dict]] = []
    for i, m in enumerate(matches):
        body_start = m.end
        body_end = matches[i + 1].start if i + 1 < len(matches) else len(text)
        body = text[body_start:body_end].strip()
        if _word_count(body) < MIN_LU_WORDS:
            continue
        out.append((m.title, body, {"start_char": body_start, "end_char": body_end}))
    return out


def _chunk_by_words(body: str, size: int, label: str) -> list[tuple[str, str, dict]]:
    words = re.findall(r"\S+", body)
    chunks: list[tuple[str, str, dict]] = []
    idx = 0
    n = 1
    while idx < len(words):
        part = words[idx : idx + size]
        chunks.append((f"{label} {n}", " ".join(part), {"word_start": idx, "word_end": idx + len(part)}))
        idx += size
        n += 1
    return chunks


def detect_learning_units(module_id: str, text: str) -> list[LearningUnit]:
    matches = _collect_lu_matches(text)
    slices = _slice_between(text, matches)
    if not slices:
        slices = _chunk_by_words(text, FALLBACK_LU_CHUNK_WORDS, label="Unit")

    units: list[LearningUnit] = []
    for i, (title, body, span) in enumerate(slices, start=1):
        lu_id = f"{module_id}-lu-{i}"
        subs = detect_subtopics(lu_id, body)
        units.append(
            LearningUnit(
                id=lu_id,
                module_id=module_id,
                ordinal=i,
                topic=title,
                subtopics=subs,
                source_span=span,
            )
        )
    return units


def _candidates_in_order(body: str) -> list[_Match]:
    """Find subtopic candidates, preferring dotted > heading > bullet.

    Rejection rules:
    - Title >80 chars -> drop
    - Inline-numbered sentences (digit, then lowercase) -> drop
    """
    candidates: list[_Match] = []

    # 1. Dotted (1.1, 1.1.1)
    for m in SUBTOPIC_DOTTED.finditer(body):
        title = _clean_title(m.group(4))
        if len(title) > MAX_TITLE_LEN or re.match(r"^[a-z]", title):
            continue
        candidates.append(_Match(m.start(), m.end(), title))

    if len(candidates) >= 2:
        candidates.sort(key=lambda x: x.start)
        return candidates

    # 2. Heading-style lines
    for m in SUBTOPIC_HEADING.finditer(body):
        title = _clean_title(m.group(1))
        if len(title) > MAX_TITLE_LEN or len(title) < 4:
            continue
        # Reject if the "heading" is actually a paragraph start
        following = body[m.end() : m.end() + 2]
        if following and not following.startswith(("\n", " ", "\t")):
            continue
        candidates.append(_Match(m.start(), m.end(), title))

    if len(candidates) >= 2:
        candidates.sort(key=lambda x: x.start)
        return candidates

    # 3. Bullets
    for m in SUBTOPIC_BULLET.finditer(body):
        title = _clean_title(m.group(1))
        if len(title) > MAX_TITLE_LEN:
            continue
        candidates.append(_Match(m.start(), m.end(), title))

    candidates.sort(key=lambda x: x.start)
    return candidates


def detect_subtopics(learning_unit_id: str, body: str) -> list[Subtopic]:
    candidates = _candidates_in_order(body)

    if not candidates:
        # Fallback chunk
        chunks = _chunk_by_words(body, FALLBACK_SUB_CHUNK_WORDS, label="Section")
        return [
            Subtopic(
                id=f"{learning_unit_id}-s-{i+1}",
                learning_unit_id=learning_unit_id,
                ordinal=i + 1,
                title=title,
                content=content,
                word_count=_word_count(content),
                resource_weight=0.0,
                effort_score=0.0,
            )
            for i, (title, content, _span) in enumerate(chunks)
        ]

    subs: list[Subtopic] = []
    for i, c in enumerate(candidates):
        content_start = c.end
        content_end = candidates[i + 1].start if i + 1 < len(candidates) else len(body)
        content = body[content_start:content_end].strip()
        wc = _word_count(content)
        # Only drop trivially empty tail sections (spurious headings)
        if wc < 5:
            continue
        subs.append(
            Subtopic(
                id=f"{learning_unit_id}-s-{len(subs)+1}",
                learning_unit_id=learning_unit_id,
                ordinal=len(subs) + 1,
                title=c.title,
                content=content,
                word_count=wc,
                resource_weight=0.0,
                effort_score=0.0,
            )
        )

    # Collapse tiny total to single overview (only if nothing meaningful found)
    if not subs:
        return [
            Subtopic(
                id=f"{learning_unit_id}-s-1",
                learning_unit_id=learning_unit_id,
                ordinal=1,
                title="Overview",
                content=body.strip(),
                word_count=_word_count(body),
                resource_weight=0.0,
                effort_score=0.0,
            )
        ]
    return subs


def estimate_effort(subtopic: Subtopic) -> float:
    """effort = (word_count / 500) + resource_weight."""
    return round((subtopic.word_count / 500.0) + subtopic.resource_weight, 3)


def normalize_structure(units: list[LearningUnit]) -> list[LearningUnit]:
    """Assigns effort scores and enforces invariants (ordinals, non-empty titles)."""
    for lu in units:
        for s in lu.subtopics:
            s.effort_score = estimate_effort(s)
    return units
