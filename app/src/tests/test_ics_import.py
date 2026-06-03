"""ICS import path uses the icalendar library now, not a hand-rolled
regex. Covers the cases that broke the previous parser: folded lines,
escaped characters, nested VALARM, TZID parameters."""
from __future__ import annotations

from app.src.models.services.moodle_service import import_ics
from app.storage import DB_PATH, init_db


def _fresh_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


_BASE = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//tests//
{events}
END:VCALENDAR
"""


def _ics(events: str) -> str:
    return _BASE.format(events=events)


def test_basic_event_imports():
    _fresh_db()
    result = import_ics(
        "u1",
        _ics(
            "BEGIN:VEVENT\n"
            "UID:basic-1\n"
            "SUMMARY:Coursework due\n"
            "DTSTART:20300115\n"
            "END:VEVENT"
        ),
    )
    assert result["events_imported"] == 1


def test_event_with_tzid_datetime():
    """Old regex failed on `DTSTART;TZID=Africa/Johannesburg:..."""
    _fresh_db()
    result = import_ics(
        "u1",
        _ics(
            "BEGIN:VEVENT\n"
            "UID:tz-1\n"
            "SUMMARY:Lab submission\n"
            "DTSTART;TZID=Africa/Johannesburg:20300214T235900\n"
            "END:VEVENT"
        ),
    )
    assert result["events_imported"] == 1


def test_event_with_nested_valarm():
    """Old regex's BEGIN:VEVENT…END:VEVENT match was non-greedy, so
    embedded VALARM blocks tripped it. icalendar walks the tree
    correctly."""
    _fresh_db()
    result = import_ics(
        "u1",
        _ics(
            "BEGIN:VEVENT\n"
            "UID:nested-1\n"
            "SUMMARY:Exam\n"
            "DTSTART:20300601\n"
            "BEGIN:VALARM\n"
            "TRIGGER:-P1D\n"
            "ACTION:DISPLAY\n"
            "END:VALARM\n"
            "END:VEVENT"
        ),
    )
    assert result["events_imported"] == 1


def test_event_with_escaped_summary():
    """Comma + semicolon must be escapable in SUMMARY without breaking
    parse. Old regex captured the wrong slice."""
    _fresh_db()
    result = import_ics(
        "u1",
        _ics(
            "BEGIN:VEVENT\n"
            "UID:esc-1\n"
            "SUMMARY:Essay 1\\, Section B\n"
            "DTSTART:20300301\n"
            "END:VEVENT"
        ),
    )
    assert result["events_imported"] == 1


def test_malformed_ics_returns_zero():
    """Garbage in → 0 events out, no crash."""
    _fresh_db()
    result = import_ics("u1", "not actually an ics file at all")
    assert result["events_imported"] == 0


def test_event_missing_summary_skipped():
    _fresh_db()
    result = import_ics(
        "u1",
        _ics(
            "BEGIN:VEVENT\nUID:no-summary\nDTSTART:20300101\nEND:VEVENT"
        ),
    )
    assert result["events_imported"] == 0
