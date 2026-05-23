"""Structured JSON logging with per-request correlation IDs.

Two pieces:

1. `configure_logging()` swaps the root logger's formatter for one
   that emits JSON. One log line, machine-parseable, keyed on
   `request_id` when one is present.

2. `RequestIdMiddleware` attaches an X-Request-ID header to every
   response (echoing the client's if they sent one, generating a
   UUID otherwise) and sets a contextvar so log records inside the
   request can include it.

Set STUDYPARTNER_LOG_FORMAT=json to enable. Default is plain text
for local dev readability; CI / prod sets the env var via the
Docker entrypoint.
"""
from __future__ import annotations

import contextvars
import json
import logging
import os
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

_REQUEST_ID: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "studypartner_request_id", default=None
)


def current_request_id() -> str | None:
    return _REQUEST_ID.get()


class JsonFormatter(logging.Formatter):
    """One log line = one compact JSON object."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        payload: dict[str, object] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = _REQUEST_ID.get()
        if rid:
            payload["request_id"] = rid
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        # Allow callers to pass `extra={"k": v}` and have it appear at
        # top level; skip stdlib LogRecord noise.
        skip = {"args", "asctime", "created", "exc_info", "exc_text", "filename",
                "funcName", "levelname", "levelno", "lineno", "message", "module",
                "msecs", "msg", "name", "pathname", "process", "processName",
                "relativeCreated", "stack_info", "thread", "threadName"}
        for k, v in record.__dict__.items():
            if k not in skip and k not in payload:
                payload[k] = v
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    level_name = os.environ.get("STUDYPARTNER_LOG_LEVEL", "INFO").upper()
    use_json = os.environ.get("STUDYPARTNER_LOG_FORMAT", "text").lower() == "json"
    root = logging.getLogger()
    root.setLevel(level_name)
    # Replace existing handlers so calling this twice (e.g. in a
    # reload) doesn't multiply output.
    for h in list(root.handlers):
        root.removeHandler(h)
    handler = logging.StreamHandler()
    if use_json:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
    root.addHandler(handler)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Generate or pass through an X-Request-ID header.

    Echoes any incoming `X-Request-ID` (caps at 128 chars, drops
    anything non-printable) so clients that already correlate across
    services keep their trace. Otherwise mints a fresh UUID4 hex.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        incoming = request.headers.get("x-request-id", "")
        clean = "".join(c for c in incoming if c.isalnum() or c in "-_")[:128]
        rid = clean or uuid.uuid4().hex
        token = _REQUEST_ID.set(rid)
        try:
            response = await call_next(request)
        finally:
            _REQUEST_ID.reset(token)
        response.headers["X-Request-ID"] = rid
        return response
