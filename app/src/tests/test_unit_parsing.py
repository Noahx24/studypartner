"""Regression tests for learning-unit detection on real-world study-guide
layouts — specifically the PDF-extraction quirks that broke PLS1502:

  * a table of contents (and an overview diagram) that list every unit
    heading near the front, with trailing page numbers;
  * the real in-body headings carrying a run-in page/section digit
    ("5STUDY UNIT 5\n5Morality ...") that the heading regex must tolerate;
  * typographic ligatures ("Deﬁning") and spaced apostrophes ("minor ' s").

Before the fix, only the contents-page copies matched, so all five chapters
collapsed into the last unit. These tests lock in the corrected behaviour.
"""
from __future__ import annotations

from app.src.models.services.content_analysis_service import detect_learning_units


def _body(unit: str, n: int) -> str:
    # ~60 words so each unit clears MIN_LU_WORDS and isn't merged away.
    return (
        f"This chapter on {unit} develops the argument in detail. "
        + " ".join(f"point {n}.{k} explores a distinct idea about {unit}" for k in range(1, 9))
        + " and closes with a short summary of the material covered."
    )


def _toc_led_document() -> str:
    # Contents page: unit headings clustered, each with a trailing page number,
    # with subtopic lines between them (loosely spaced, like the real PDF).
    toc = "CONTENTS\nPage\nINTRODUCTION iv\n"
    titles = [
        "Defining African philosophy",
        "Discourses on Africa",
        "Trends in African philosophy",
        "Philosophical anthropology",
        "Morality in African thought",
    ]
    page = 1
    for i, t in enumerate(titles, start=1):
        toc += f"Study unit {i}: {t} {page}\n"
        for k in range(1, 5):
            toc += f"{i}.{k} Some subtopic about {t.lower()} {page + k}\n"
        page += 11

    # Overview diagram: same headings again, very densely packed, no page nums.
    diagram = "The diagram below gives an overview of the module:\n"
    for i, t in enumerate(titles, start=1):
        diagram += f"Study unit {i}\n{t}\n"

    # Front matter between the overview and the first real chapter — like the
    # "Link with other modules" / learning-outcomes prose in a real guide.
    front_matter = (
        "Link with other modules. " * 30
        + "This module introduces the field and sets out how to study it. " * 8
    )

    # Real bodies: each heading carries a run-in section digit, pages apart.
    bodies = ""
    for i, t in enumerate(titles, start=1):
        bodies += f"\n\n{i}STUDY UNIT {i}\n{i}{t}\n{i}.1 Introduction\n{_body(t, i)}\n"

    return toc + "\n\n" + diagram + "\n\n" + front_matter + bodies


def test_toc_and_overview_do_not_collapse_units():
    units = detect_learning_units("m-pls", _toc_led_document())
    # Five real chapters, not four TOC slivers + one giant tail.
    assert len(units) == 5, [u.topic for u in units]
    # Bodies are detected from the real headings, so each carries real content.
    for u in units:
        assert len(u.subtopics) >= 1
        body_chars = u.source_span["end_char"] - u.source_span["start_char"]
        assert body_chars < 5000, f"U{u.ordinal} absorbed too much: {body_chars} chars"


def test_run_in_digit_and_ligatures_cleaned_from_titles():
    units = detect_learning_units("m-pls", _toc_led_document())
    topics = [u.topic for u in units]
    # Run-in section digit stripped ("5Morality" -> "Morality"); no page nums.
    assert topics == [
        "Defining African philosophy",
        "Discourses on Africa",
        "Trends in African philosophy",
        "Philosophical anthropology",
        "Morality in African thought",
    ], topics


def test_ligature_and_apostrophe_normalisation():
    text = (
        "STUDY UNIT 1\n"
        "The minor ’ s contractual capacity\n"
        "1.1 Overview\n" + _body("capacity", 1) + "\n"
    )
    units = detect_learning_units("m-x", text)
    assert units[0].topic == "The minor’s contractual capacity", units[0].topic


def test_purely_numeric_heading_is_rejected():
    # A stray page number must never become a unit title.
    text = (
        "UNIT 1\n126\n1.1 Intro\n" + _body("nothing", 1) + "\n\n"
        "CHAPTER 2: REAL TOPIC\n2.1 Intro\n" + _body("real topic", 2) + "\n"
    )
    topics = [u.topic for u in detect_learning_units("m-n", text)]
    assert "126" not in topics, topics
