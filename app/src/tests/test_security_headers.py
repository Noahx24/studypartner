"""Static security headers on every API response.

Locks down the API surface so any future error page (or compromised
endpoint) can't be iframed, mime-sniffed, or hijack the referer.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_security_headers_on_success():
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "no-referrer"
    assert "max-age=31536000" in r.headers["Strict-Transport-Security"]
    assert "default-src 'none'" in r.headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]


def test_security_headers_on_error():
    # 404 from an unknown route also gets the headers.
    r = TestClient(app).get("/this-route-does-not-exist")
    assert r.status_code == 404
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
