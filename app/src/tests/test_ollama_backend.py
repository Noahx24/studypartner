"""Tests for the Ollama LLM backend used for local development.

We don't actually talk to a running Ollama instance — these tests
monkey-patch `urllib.request.urlopen` so we can exercise the request
shape, response parsing, and error fallback paths deterministically.
"""
from __future__ import annotations

import io
import json
import urllib.error
import urllib.request

import pytest

from app.src.models import (
    AIFeatureSet,
    LearningUnit,
    Subtopic,
    UserSelection,
)
from app.src.models.services import ai_service
from app.src.models.services.ai_service import (
    AIService,
    OllamaUnavailable,
    _build_llm,
    _OllamaLLM,
)
from app.src.utils.time import utcnow_aware
from app.storage import DB_PATH, init_db


def _fresh_db() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


class _FakeResponse:
    """Minimal stand-in for the response object urllib.request returns."""

    def __init__(self, body: bytes) -> None:
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


@pytest.fixture(autouse=True)
def _reset_env(monkeypatch):
    """Each test starts with no LLM env vars set."""
    for k in (
        "STUDYPARTNER_LLM_BACKEND",
        "OLLAMA_BASE_URL",
        "OLLAMA_MODEL",
        "OLLAMA_TIMEOUT",
    ):
        monkeypatch.delenv(k, raising=False)


def test_build_llm_selects_ollama_when_env_set(monkeypatch):
    monkeypatch.setenv("STUDYPARTNER_LLM_BACKEND", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "llama3.2")
    caller, model = _build_llm()
    assert isinstance(caller, _OllamaLLM)
    assert model == "ollama:llama3.2"
    assert caller.base_url == "http://localhost:11434"


def test_build_llm_falls_back_to_stub_without_env():
    caller, model = _build_llm()
    assert not isinstance(caller, _OllamaLLM)
    assert "stub" in model


def test_ollama_request_shape(monkeypatch):
    """Verify we POST `format: json` + `stream: false` so small local
    models can't return free-form prose. Captures the request body so
    we can assert on it without hitting the real daemon."""
    captured: dict = {}

    def fake_urlopen(req, timeout):
        captured["url"] = req.full_url
        captured["headers"] = dict(req.headers)
        captured["body"] = json.loads(req.data.decode("utf-8"))
        captured["timeout"] = timeout
        return _FakeResponse(json.dumps({"response": '{"bullets":["ok"]}'}).encode("utf-8"))

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    client = _OllamaLLM(base_url="http://localhost:11434", model="llama3.2", timeout_seconds=15)
    out = client("Summarise this", max_tokens=400)

    assert out == '{"bullets":["ok"]}'
    assert captured["url"] == "http://localhost:11434/api/generate"
    assert captured["body"]["model"] == "llama3.2"
    assert captured["body"]["prompt"] == "Summarise this"
    assert captured["body"]["stream"] is False
    assert captured["body"]["format"] == "json"
    assert captured["body"]["options"]["num_predict"] == 400
    assert captured["timeout"] == 15


def test_ollama_raises_unavailable_on_connection_error(monkeypatch):
    def fake_urlopen(req, timeout):
        raise urllib.error.URLError("Connection refused")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    client = _OllamaLLM()
    with pytest.raises(OllamaUnavailable) as exc_info:
        client("anything", 100)
    assert "Connection refused" in str(exc_info.value)


def test_ollama_raises_unavailable_on_non_json_response(monkeypatch):
    def fake_urlopen(req, timeout):
        return _FakeResponse(b"<html>503 backend down</html>")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    client = _OllamaLLM()
    with pytest.raises(OllamaUnavailable):
        client("anything", 100)


def test_ollama_raises_unavailable_on_error_field(monkeypatch):
    """Ollama returns 200 with `{"error": "..."}` when e.g. a model
    isn't pulled. Treat that the same as an HTTP failure."""
    def fake_urlopen(req, timeout):
        return _FakeResponse(json.dumps({"error": "model 'llama99' not found"}).encode("utf-8"))

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    client = _OllamaLLM()
    with pytest.raises(OllamaUnavailable) as exc_info:
        client("anything", 100)
    assert "llama99" in str(exc_info.value)


def test_ai_service_falls_back_to_stub_when_ollama_unreachable(monkeypatch):
    """End-to-end: AIService is wired to Ollama, Ollama is down,
    generate_summary still returns a usable payload (from the stub) and
    the artifact is tagged with the stub model so a future retry can
    re-run against Ollama."""
    _fresh_db()
    monkeypatch.setenv("STUDYPARTNER_LLM_BACKEND", "ollama")

    def fake_urlopen(req, timeout):
        raise urllib.error.URLError("daemon not running")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    sub = Subtopic(
        id="s-1",
        learning_unit_id="lu-1",
        ordinal=1,
        title="Mitochondria",
        content="The mitochondrion is the powerhouse of the cell. " * 20,
        word_count=120,
    )
    selection = UserSelection(
        id="sel-1",
        user_id="u",
        module_id="m",
        subtopic_ids=["s-1"],
        ai_features=AIFeatureSet(),
        updated_at=utcnow_aware(),
    )

    service = AIService()
    payload = service.generate_summary(sub, selection)

    assert "bullets" in payload or "key_concepts" in payload, payload


def test_ai_service_uses_ollama_response_when_reachable(monkeypatch):
    """Happy path: Ollama is up, AIService uses its output verbatim."""
    _fresh_db()
    monkeypatch.setenv("STUDYPARTNER_LLM_BACKEND", "ollama")

    captured: dict = {}

    def fake_urlopen(req, timeout):
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return _FakeResponse(
            json.dumps(
                {
                    "response": json.dumps(
                        {
                            "key_concepts": ["ATP", "respiration"],
                            "bullets": ["The mitochondrion makes ATP."],
                            "simple_explanation": "It's the cell's power plant.",
                        }
                    )
                }
            ).encode("utf-8")
        )

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    sub = Subtopic(
        id="s-1",
        learning_unit_id="lu-1",
        ordinal=1,
        title="Mitochondria",
        content="The mitochondrion is the powerhouse of the cell.",
        word_count=10,
    )
    selection = UserSelection(
        id="sel-1",
        user_id="u",
        module_id="m",
        subtopic_ids=["s-1"],
        ai_features=AIFeatureSet(),
        updated_at=utcnow_aware(),
    )

    service = AIService()
    payload = service.generate_summary(sub, selection)

    assert payload["bullets"] == ["The mitochondrion makes ATP."]
    assert "ATP" in payload["key_concepts"]
    # Confirm we sent the prompt to Ollama, not the stub
    assert captured["body"]["model"].startswith("llama")


def test_ollama_caching_skips_second_call(monkeypatch):
    """The same (scope, ref_id, content_hash, prompt_hash) must hit cache
    on the second invocation — Ollama is only called once."""
    _fresh_db()
    monkeypatch.setenv("STUDYPARTNER_LLM_BACKEND", "ollama")

    call_count = {"n": 0}

    def fake_urlopen(req, timeout):
        call_count["n"] += 1
        return _FakeResponse(
            json.dumps({"response": json.dumps({"bullets": ["once"]})}).encode("utf-8")
        )

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    sub = Subtopic(
        id="s-1",
        learning_unit_id="lu-1",
        ordinal=1,
        title="X",
        content="Some body content. " * 5,
        word_count=10,
    )
    selection = UserSelection(
        id="sel-1",
        user_id="u",
        module_id="m",
        subtopic_ids=["s-1"],
        ai_features=AIFeatureSet(),
        updated_at=utcnow_aware(),
    )

    service = AIService()
    first = service.generate_summary(sub, selection)
    second = service.generate_summary(sub, selection)
    assert first == second
    assert call_count["n"] == 1, "second call should hit the artifact cache"


def test_stub_fallback_does_not_block_ollama_recovery(monkeypatch):
    """Regression: when Ollama is down on the first call we cache a stub
    artifact. Without the model-aware lookup, the second call (with
    Ollama recovered) would still see a cache hit on the stub row and
    never retry the real backend — defeating the entire fallback design.

    With the fix, the second call's lookup filters by the Ollama model,
    misses the stub-tagged row, calls Ollama, and INSERT OR REPLACE
    overwrites the stub artifact with the real one.
    """
    _fresh_db()
    monkeypatch.setenv("STUDYPARTNER_LLM_BACKEND", "ollama")

    sub = Subtopic(
        id="s-1",
        learning_unit_id="lu-1",
        ordinal=1,
        title="Mitochondria",
        content="The mitochondrion is the powerhouse of the cell.",
        word_count=10,
    )
    selection = UserSelection(
        id="sel-1",
        user_id="u",
        module_id="m",
        subtopic_ids=["s-1"],
        ai_features=AIFeatureSet(),
        updated_at=utcnow_aware(),
    )

    # ---- Phase 1: Ollama down → stub fallback caches a stub artifact.
    def urlopen_down(req, timeout):
        raise urllib.error.URLError("daemon offline")

    monkeypatch.setattr(urllib.request, "urlopen", urlopen_down)
    service = AIService()  # picks up env, builds Ollama caller
    payload_down = service.generate_summary(sub, selection)
    # The stub returns key_concepts/bullets/simple_explanation
    assert "bullets" in payload_down

    # Confirm an artifact was stored, and it's tagged with the stub model
    # rather than the Ollama model. We don't filter by model here so we
    # observe whatever row was actually saved.
    from app.storage import get_ai_artifact
    from app.src.models.services.ai_service import PROMPT_SUMMARY, _sha
    content_hash = _sha(sub.content)
    # prompt_hash now includes the corrections preamble — empty in
    # this test (no parsing_feedback rows for the user/module).
    prompt_hash = _sha(
        PROMPT_SUMMARY + f"|low_data=0|corrections={_sha('')}"
    )
    stub_hit = get_ai_artifact("summary", "s-1", content_hash, prompt_hash)
    assert stub_hit is not None
    assert stub_hit.model == "stub-llm-v1"

    # ---- Phase 2: Ollama recovers → next call MUST retry it.
    ollama_calls = {"n": 0}

    def urlopen_up(req, timeout):
        ollama_calls["n"] += 1
        return _FakeResponse(
            json.dumps(
                {"response": json.dumps({
                    "key_concepts": ["ATP"],
                    "bullets": ["Real Ollama answer"],
                    "simple_explanation": "Now powered by the real model.",
                })}
            ).encode("utf-8")
        )

    monkeypatch.setattr(urllib.request, "urlopen", urlopen_up)
    payload_up = service.generate_summary(sub, selection)

    assert ollama_calls["n"] == 1, "Ollama must be retried after recovery"
    assert payload_up["bullets"] == ["Real Ollama answer"]
    assert payload_up != payload_down, "stub payload must not be served once Ollama is back"

    # ---- Phase 3: One more call should hit the cache (Ollama row now wins).
    payload_again = service.generate_summary(sub, selection)
    assert ollama_calls["n"] == 1, "post-recovery call should hit cache, not call Ollama again"
    assert payload_again == payload_up
