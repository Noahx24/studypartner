"""Lightweight metrics + readiness probe without a hard dependency on
prometheus_client. We expose three things:

  GET /ready    — 200 if the DB is reachable, 503 otherwise. K8s/ALB
                  uses this to gate traffic during rolling deploys.
  GET /metrics  — Prometheus exposition format. Counters for request
                  totals and error totals, all in-process — no external
                  collector. If you want richer metrics later, swap to
                  the real prometheus_client library.

We avoid the prometheus_client dep on purpose: it's heavy for what we
need today (request counts) and adds another thing to maintain. The
hand-rolled exposition below is correct for the simple counter use
case; the moment we want histograms or labels, swap to the library.
"""
from __future__ import annotations

import threading

from fastapi import APIRouter, Request, Response

from app.storage import get_connection

router = APIRouter(tags=["observability"])

_lock = threading.Lock()
_counts: dict[tuple[str, int], int] = {}


def record_request(path: str, status: int) -> None:
    """Bump the (path, status) counter. Called from middleware."""
    # Group routes by their FastAPI template (`/modules/{id}`) rather
    # than concrete path to avoid an unbounded cardinality explosion.
    key = (path, status)
    with _lock:
        _counts[key] = _counts.get(key, 0) + 1


@router.get("/ready")
def ready_endpoint() -> Response:
    """Hit the DB to confirm the connection works. Cheap enough to be
    called every few seconds by a load balancer."""
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1").fetchone()
    except Exception:
        return Response(
            content='{"status":"not_ready"}',
            status_code=503,
            media_type="application/json",
        )
    return Response(
        content='{"status":"ready"}',
        status_code=200,
        media_type="application/json",
    )


@router.get("/metrics")
def metrics_endpoint() -> Response:
    """Prometheus text exposition. One counter family."""
    lines = [
        "# HELP studypartner_requests_total Count of API requests by route template and status",
        "# TYPE studypartner_requests_total counter",
    ]
    with _lock:
        snapshot = dict(_counts)
    for (path, status), n in sorted(snapshot.items()):
        # Escape backslashes + quotes per the exposition spec.
        safe_path = path.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(
            f'studypartner_requests_total{{route="{safe_path}",status="{status}"}} {n}'
        )
    body = "\n".join(lines) + "\n"
    return Response(content=body, media_type="text/plain; version=0.0.4")


def attach_counter_middleware(app) -> None:
    """Wire up the request counter as a Starlette middleware.

    Imported from main.py so the routing setup stays in one place.
    """

    @app.middleware("http")
    async def _count(request: Request, call_next):
        response = await call_next(request)
        # Match FastAPI's route template so /modules/abc and /modules/xyz
        # don't blow up cardinality. If no route matched (e.g. 404),
        # fall back to the literal path.
        route = request.scope.get("route")
        template = getattr(route, "path", None) or request.url.path
        record_request(template, response.status_code)
        return response
