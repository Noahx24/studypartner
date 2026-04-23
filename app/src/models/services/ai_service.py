"""AI enrichment — cached, gated, deterministic when no LLM is configured.

- Every call goes through `_cached()`. Same (scope, ref_id, content_hash,
  prompt_hash) never invokes the LLM twice.
- Runs server-side only. Client never calls the LLM directly.
- Gating: `generate_*` refuses to produce artifacts whose scope is disabled
  in the active UserSelection.
- If no LLM backend is configured, returns deterministic template artifacts
  built from the source content — keeps the system fully functional offline
  for demos / tests without external dependencies.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import os
import re
from typing import Callable

from app.src.models import AIArtifact, LearningUnit, Subtopic, UserSelection
from app.storage import get_ai_artifact, save_ai_artifact, delete_ai_artifacts_for


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


def _build_llm() -> tuple[LLMCall, str]:
    """Return (caller, model). Replace with OpenAI/Anthropic/etc in production."""
    if os.environ.get("STUDYPARTNER_LLM_BACKEND") == "anthropic" and os.environ.get("ANTHROPIC_API_KEY"):
        # Placeholder for real backend. Wire anthropic.messages.create here.
        # For now still defer to the stub — keeps the code path off in tests.
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
    ) -> dict:
        prompt = prompt_template.format(**prompt_vars)
        content_hash = _sha(body)
        prompt_hash = _sha(prompt_template + f"|low_data={int(low_data)}")

        hit = get_ai_artifact(scope, ref_id, content_hash, prompt_hash)
        if hit:
            return hit.payload

        max_tokens = 350 if low_data else 1200
        raw = self.llm(prompt, max_tokens)  # type: ignore[misc]

        payload = _safe_parse_json(raw)
        artifact = AIArtifact(
            id=_artifact_id(scope, ref_id, content_hash, prompt_hash, self.model or "unknown"),
            scope=scope,  # type: ignore[arg-type]
            ref_id=ref_id,
            content_hash=content_hash,
            prompt_hash=prompt_hash,
            payload=payload,
            model=self.model or "unknown",
            created_at=datetime.utcnow(),
        )
        save_ai_artifact(artifact)
        return payload


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
