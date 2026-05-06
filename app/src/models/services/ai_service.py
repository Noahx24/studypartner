"""AI enrichment — cached, gated, deterministic when no LLM is configured.

- Every call goes through `_cached()`. Same (scope, ref_id, content_hash,
  prompt_hash) never invokes the LLM twice.
- Runs server-side only. Client never calls the LLM directly.
- Gating: `generate_*` refuses to produce artifacts whose scope is disabled
  in the active UserSelection.
- If no LLM backend is configured, returns deterministic template artifacts
  built from the source content — keeps the system fully functional offline
  for demos / tests without external dependencies.

Backends are picked via STUDYPARTNER_LLM_BACKEND:
  - unset / "stub"  → deterministic templates
  - "ollama"        → local Ollama daemon (default for `make dev`)
  - "anthropic"     → placeholder (not wired yet)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.src.utils.time import utcnow_aware
import hashlib
import json as _json
import logging
import os
import re
from typing import Callable
import urllib.error
import urllib.parse
import urllib.request

from app.src.models import AIArtifact, LearningUnit, Subtopic, UserSelection
from app.storage import (
    delete_ai_artifacts_for,
    get_ai_artifact,
    list_recent_parsing_corrections,
    save_ai_artifact,
)

logger = logging.getLogger(__name__)


# ---- Prompt templates (hash-stable) ----

PROMPT_SUMMARY = """Summarise the following subtopic for a student revising for an exam.
Return STRICT JSON with keys: key_concepts (string[]), bullets (string[]), simple_explanation (string).
TITLE: {title}
BODY:
{body}"""

PROMPT_SUBTOPIC_QUIZ = """Generate 3-5 quiz questions for the subtopic below.
Return STRICT JSON: {{"questions":[{{"type":"mcq","q":str,"choices":[str,str,str,str],"answer":int,"explain":str}}, {{"type":"short","q":str,"answer":str}}]}}
TITLE: {title}
BODY:
{body}"""

PROMPT_TOPIC_QUIZ = """Generate 8-12 revision questions covering the whole learning unit.
Return STRICT JSON in the same format as the subtopic quiz.
TOPIC: {topic}
BODY:
{body}"""

LOW_DATA_SUMMARY = """Produce a 3-bullet summary of:\n{body}\nJSON: key_concepts[], bullets[], simple_explanation."""
LOW_DATA_SUBTOPIC_QUIZ = """Generate 3 MCQs for:\n{body}\nJSON: {{"questions":[...]}}"""


# ---- Hash helpers ----

def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _artifact_id(scope: str, ref_id: str, content_hash: str, prompt_hash: str, model: str) -> str:
    return _sha(f"{scope}|{ref_id}|{content_hash}|{prompt_hash}|{model}")


# ---- LLM client abstraction ----

LLMCall = Callable[[str, int], str]  # (prompt, max_tokens) -> raw_json_text


class _StubLLM:
    """Deterministic template output. Used when no API key is configured."""

    model = "stub-llm-v1"

    def __call__(self, prompt: str, max_tokens: int) -> str:
        import json as _json

        body = _extract_body_from_prompt(prompt)
        if "Summarise" in prompt or "3-bullet summary" in prompt:
            sentences = _split_sentences(body)
            bullets = sentences[:3] if sentences else ["No content available."]
            key = _top_keywords(body, n=5)
            return _json.dumps({
                "key_concepts": key,
                "bullets": bullets,
                "simple_explanation": (sentences[0] if sentences else body[:200]),
            })
        # Quiz
        sentences = _split_sentences(body)
        q = (sentences[0] if sentences else body[:120]).rstrip(".") + "?"
        keywords = _top_keywords(body, n=4) or ["concept", "idea", "fact", "term"]
        while len(keywords) < 4:
            keywords.append(f"option{len(keywords)}")
        return _json.dumps({
            "questions": [
                {
                    "type": "mcq",
                    "q": f"What is the core idea of: {q}",
                    "choices": keywords[:4],
                    "answer": 0,
                    "explain": "Refer to the subtopic content.",
                },
                {
                    "type": "short",
                    "q": f"Briefly explain {keywords[0]}.",
                    "answer": (sentences[1] if len(sentences) > 1 else keywords[0]),
                },
                {
                    "type": "mcq",
                    "q": "Which term best fits the topic?",
                    "choices": keywords[:4],
                    "answer": 0,
                    "explain": "Derived from keywords.",
                },
            ]
        })


def _extract_body_from_prompt(prompt: str) -> str:
    m = re.search(r"BODY:\n(.+)$", prompt, re.DOTALL)
    if m:
        return m.group(1).strip()
    return prompt


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def _top_keywords(text: str, n: int) -> list[str]:
    words = re.findall(r"[A-Za-z]{5,}", text.lower())
    stop = {"which", "these", "those", "about", "their", "there", "where", "while", "until", "could", "would", "should", "because", "through", "between"}
    freq: dict[str, int] = {}
    for w in words:
        if w in stop:
            continue
        freq[w] = freq.get(w, 0) + 1
    return [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])[:n]]


class OllamaUnavailable(Exception):
    """Raised when Ollama is configured but unreachable / errored. Callers
    decide whether to fall back to the stub or surface the error."""


class _OllamaLLM:
    """Talks to a locally-running Ollama daemon for development / testing.

    Ollama exposes an HTTP API on 127.0.0.1:11434 by default. We use
    `/api/generate` with `stream: false` and `format: "json"` — the format
    flag tells Ollama to emit valid JSON, which sidesteps the messy
    "model wraps JSON in prose" problem with smaller local models.

    Configuration:
      OLLAMA_BASE_URL   default http://localhost:11434
      OLLAMA_MODEL      default llama3.2 (3B parameters — fits on a laptop)
      OLLAMA_TIMEOUT    default 60 seconds (cold load can be slow)

    Calls cost nothing and produce no log lines on success — but on
    failure they raise OllamaUnavailable so the caller can decide
    whether to retry, fall back, or propagate.
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        self.base_url = (base_url or os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/")
        self.model = model or os.environ.get("OLLAMA_MODEL") or "llama3.2"
        self.timeout_seconds = timeout_seconds or float(os.environ.get("OLLAMA_TIMEOUT") or 60.0)

    def __call__(self, prompt: str, max_tokens: int) -> str:
        """Return raw model output. Always JSON-shaped because we set
        `format: "json"`, but we don't validate here — `_safe_parse_json`
        downstream is the single source of truth for parse-or-fallback."""
        body = _json.dumps({
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                # num_predict caps generated tokens; matches our existing
                # max_tokens budget per call.
                "num_predict": max_tokens,
                "temperature": 0.2,
            },
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/api/generate",
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            raise OllamaUnavailable(f"Ollama request failed: {exc}") from exc
        try:
            payload = _json.loads(raw)
        except _json.JSONDecodeError as exc:
            raise OllamaUnavailable("Ollama returned non-JSON envelope") from exc
        if "error" in payload:
            raise OllamaUnavailable(f"Ollama error: {payload['error']}")
        # Ollama puts the model output in `response`. Already JSON-shaped
        # because we set format=json — return it as-is for _safe_parse_json.
        return payload.get("response", "")


def _build_llm() -> tuple[LLMCall, str]:
    """Return (caller, model_name).

    Selector via STUDYPARTNER_LLM_BACKEND:
      - "ollama"     → _OllamaLLM (local). On startup-time misconfig or
                       network failure we fall back to the stub so the
                       app still runs; per-request failures bubble up
                       through OllamaUnavailable for the caller to handle.
      - "anthropic"  → not wired yet; placeholder still defers to stub.
      - anything else → deterministic stub.
    """
    backend = os.environ.get("STUDYPARTNER_LLM_BACKEND", "").lower()

    if backend == "ollama":
        client = _OllamaLLM()
        return client, f"ollama:{client.model}"

    if backend == "anthropic" and os.environ.get("ANTHROPIC_API_KEY"):
        # Placeholder for real backend. Wire anthropic.messages.create here.
        stub = _StubLLM()
        return stub, "anthropic-wired-but-stubbed"

    stub = _StubLLM()
    return stub, stub.model


# ---- Public service ----

@dataclass
class AIService:
    llm: LLMCall | None = None
    model: str | None = None
    low_data: bool = False

    def __post_init__(self) -> None:
        if self.llm is None or self.model is None:
            call, mdl = _build_llm()
            self.llm = self.llm or call
            self.model = self.model or mdl

    # -- gating --
    @staticmethod
    def _ensure_allowed(selection: UserSelection, scope: str, ref_id: str) -> None:
        if scope == "summary" and not selection.ai_features.summaries:
            raise PermissionError("Summaries disabled in selection")
        if scope == "subtopic_quiz" and not selection.ai_features.subtopic_quiz:
            raise PermissionError("Subtopic quizzes disabled in selection")
        if scope == "topic_quiz" and not selection.ai_features.topic_quiz:
            raise PermissionError("Topic quizzes disabled in selection")
        if scope in {"summary", "subtopic_quiz"} and ref_id not in selection.subtopic_ids:
            raise PermissionError(f"Subtopic {ref_id} not in selection")

    # -- public generators --
    def generate_summary(self, sub: Subtopic, selection: UserSelection) -> dict:
        self._ensure_allowed(selection, "summary", sub.id)
        prompt = LOW_DATA_SUMMARY if (selection.low_data_mode or self.low_data) else PROMPT_SUMMARY
        return self._cached(
            scope="summary",
            ref_id=sub.id,
            body=sub.content,
            prompt_template=prompt,
            prompt_vars={"title": sub.title, "body": sub.content},
            low_data=selection.low_data_mode or self.low_data,
            user_id=selection.user_id,
            module_id=selection.module_id,
        )

    def generate_subtopic_quiz(self, sub: Subtopic, selection: UserSelection) -> dict:
        self._ensure_allowed(selection, "subtopic_quiz", sub.id)
        prompt = LOW_DATA_SUBTOPIC_QUIZ if (selection.low_data_mode or self.low_data) else PROMPT_SUBTOPIC_QUIZ
        return self._cached(
            scope="subtopic_quiz",
            ref_id=sub.id,
            body=sub.content,
            prompt_template=prompt,
            prompt_vars={"title": sub.title, "body": sub.content},
            low_data=selection.low_data_mode or self.low_data,
            user_id=selection.user_id,
            module_id=selection.module_id,
        )

    def generate_topic_quiz(self, lu: LearningUnit, selection: UserSelection) -> dict:
        self._ensure_allowed(selection, "topic_quiz", lu.id)
        selected_subs = [s for s in lu.subtopics if s.id in selection.subtopic_ids]
        if not selected_subs:
            raise ValueError("No selected subtopics in learning unit")
        body = "\n\n".join(f"## {s.title}\n{s.content}" for s in selected_subs)
        return self._cached(
            scope="topic_quiz",
            ref_id=lu.id,
            body=body,
            prompt_template=PROMPT_TOPIC_QUIZ,
            prompt_vars={"topic": lu.topic, "body": body},
            low_data=selection.low_data_mode or self.low_data,
            user_id=selection.user_id,
            module_id=selection.module_id,
        )

    def regenerate(self, scope: str, ref_id: str, salt: str | None = None) -> None:
        """Drop cached artifacts for (scope, ref_id). Subsequent generate calls produce fresh output."""
        delete_ai_artifacts_for(scope, ref_id)

    # -- core cache-or-call --
    def _cached(
        self,
        scope: str,
        ref_id: str,
        body: str,
        prompt_template: str,
        prompt_vars: dict,
        low_data: bool,
        user_id: str | None = None,
        module_id: str | None = None,
    ) -> dict:
        prompt = prompt_template.format(**prompt_vars)
        # Recent user corrections become a "previously the user changed
        # X to Y" preamble. This is the core feedback-improves-accuracy
        # loop: rename a misparsed unit once, future AI runs on the same
        # module see the rename and bias toward the corrected vocabulary.
        # Corrections are folded into the prompt_hash so flipping them
        # does NOT silently serve a stale cached artifact.
        corrections_block = ""
        if user_id and module_id:
            corrections = list_recent_parsing_corrections(user_id, module_id, limit=5)
            if corrections:
                corrections_block = _format_corrections_preamble(corrections)
                prompt = corrections_block + prompt

        content_hash = _sha(body)
        prompt_hash = _sha(prompt_template + f"|low_data={int(low_data)}|corrections={_sha(corrections_block)}")

        # Filter the cache lookup by the *currently configured* model.
        # Without this, a stub artifact stored during an Ollama fallback
        # would be served forever — Ollama would never get retried after
        # it recovered, because the cache hit short-circuits the call.
        # With it, a model mismatch (cached stub vs active Ollama) reads
        # as a miss; we re-call the active backend and INSERT OR REPLACE
        # on save overwrites the stale row.
        active_model = self.model or "unknown"
        hit = get_ai_artifact(scope, ref_id, content_hash, prompt_hash, model=active_model)
        if hit:
            return hit.payload

        max_tokens = 350 if low_data else 1200
        # If the active backend (e.g. Ollama) is unreachable, log once and
        # fall through to the deterministic stub so the user still gets
        # something useful instead of a 500. The artifact is tagged with
        # the stub's model — so the next request (with Ollama back up)
        # filters by the Ollama model, misses, and re-tries the real
        # backend. That's the recovery path.
        model_used = active_model
        try:
            raw = self.llm(prompt, max_tokens)  # type: ignore[misc]
        except OllamaUnavailable as exc:
            logger.warning("Falling back to stub LLM: %s", exc)
            stub = _StubLLM()
            raw = stub(prompt, max_tokens)
            model_used = stub.model

        payload = _safe_parse_json(raw)
        artifact = AIArtifact(
            id=_artifact_id(scope, ref_id, content_hash, prompt_hash, model_used),
            scope=scope,  # type: ignore[arg-type]
            ref_id=ref_id,
            content_hash=content_hash,
            prompt_hash=prompt_hash,
            payload=payload,
            model=model_used,
            created_at=utcnow_aware(),
        )
        save_ai_artifact(artifact)
        return payload


def _format_corrections_preamble(corrections: list[dict]) -> str:
    """Turn raw parsing_feedback rows into a few-shot preamble. Kept short
    on purpose — small local models (Ollama) get easily distracted by long
    contexts."""
    lines = [
        "Use the following user corrections from earlier in this module as guidance — match the user's vocabulary and structural style:"
    ]
    for c in corrections:
        kind = c.get("kind")
        before = c.get("before") or {}
        after = c.get("after") or {}
        if kind == "rename_unit":
            lines.append(f"- Unit was renamed from {before.get('topic')!r} to {after.get('topic')!r}")
        elif kind == "rename_subtopic":
            lines.append(f"- Subtopic was renamed from {before.get('title')!r} to {after.get('title')!r}")
        elif kind == "edit_subtopic_content":
            lines.append("- A subtopic's content was edited; prefer concise, focused subtopics.")
    lines.append("---")
    return "\n".join(lines) + "\n"


def _safe_parse_json(raw: str) -> dict:
    import json as _json

    try:
        return _json.loads(raw)
    except _json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                return _json.loads(m.group(0))
            except _json.JSONDecodeError:
                pass
    return {"raw": raw}
