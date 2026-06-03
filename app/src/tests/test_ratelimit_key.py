"""Rate-limit key function: proxy-aware behind STUDYPARTNER_TRUST_PROXY."""
from __future__ import annotations

from unittest.mock import MagicMock


class _Headers(dict):
    """Case-insensitive .get(), matching what Starlette gives us."""

    def __init__(self, mapping):
        super().__init__({k.lower(): v for k, v in mapping.items()})

    def get(self, key, default=""):  # noqa: A003
        return super().get(key.lower(), default)


def _make_request(headers, client_host="10.0.0.1"):
    req = MagicMock()
    req.headers = _Headers(headers)
    req.client = MagicMock()
    req.client.host = client_host
    return req


def test_socket_peer_when_proxy_not_trusted(monkeypatch):
    monkeypatch.delenv("STUDYPARTNER_TRUST_PROXY", raising=False)
    from app.src.utils.ratelimit import _client_key
    req = _make_request({"X-Forwarded-For": "9.9.9.9"}, client_host="10.0.0.1")
    assert _client_key(req) == "10.0.0.1"


def test_xff_first_hop_when_proxy_trusted(monkeypatch):
    monkeypatch.setenv("STUDYPARTNER_TRUST_PROXY", "1")
    from app.src.utils.ratelimit import _client_key
    req = _make_request(
        {"X-Forwarded-For": "9.9.9.9, 10.0.0.5, 10.0.0.6"}, client_host="10.0.0.1"
    )
    assert _client_key(req) == "9.9.9.9"


def test_x_real_ip_fallback_when_xff_missing(monkeypatch):
    monkeypatch.setenv("STUDYPARTNER_TRUST_PROXY", "1")
    from app.src.utils.ratelimit import _client_key
    req = _make_request({"X-Real-IP": "8.8.8.8"}, client_host="10.0.0.1")
    assert _client_key(req) == "8.8.8.8"


def test_falls_back_to_socket_peer_when_xff_blank(monkeypatch):
    monkeypatch.setenv("STUDYPARTNER_TRUST_PROXY", "1")
    from app.src.utils.ratelimit import _client_key
    req = _make_request({"X-Forwarded-For": ""}, client_host="10.0.0.1")
    assert _client_key(req) == "10.0.0.1"
