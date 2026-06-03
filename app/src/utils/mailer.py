"""Outbound email.

Two backends, selected via STUDYPARTNER_MAILER:
- "stub" (default): writes the message to the application log. Useful
  for local dev and tests; lets us assert "an email would have been
  sent here" without an SMTP server.
- "smtp": opens an SMTP connection per send. Production config needs
  STUDYPARTNER_SMTP_HOST, STUDYPARTNER_SMTP_PORT (default 587),
  STUDYPARTNER_SMTP_USERNAME, STUDYPARTNER_SMTP_PASSWORD,
  STUDYPARTNER_SMTP_FROM (RFC-5322 from-address). TLS via STARTTLS.

For SES, SendGrid, Postmark etc.: their SMTP endpoints work without
code changes — set host/port/user/pass to the provider's values.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    """Best-effort outbound email. Never raises — a stuck mailer should
    not block a request flow. The caller decides whether to surface a
    "we sent you an email" message to the user (we say so even on
    failure to avoid email-enumeration attacks)."""
    backend = os.environ.get("STUDYPARTNER_MAILER", "stub").lower()
    try:
        if backend == "smtp":
            _send_smtp(to, subject, body)
        else:
            _send_stub(to, subject, body)
    except Exception as exc:
        logger.error("Outbound email to %s failed: %s", to, exc, exc_info=True)


def _send_stub(to: str, subject: str, body: str) -> None:
    logger.info("[stub mailer] To: %s | Subject: %s\n%s\n---", to, subject, body)


def _send_smtp(to: str, subject: str, body: str) -> None:
    host = os.environ["STUDYPARTNER_SMTP_HOST"]
    port = int(os.environ.get("STUDYPARTNER_SMTP_PORT", "587"))
    user = os.environ["STUDYPARTNER_SMTP_USERNAME"]
    password = os.environ["STUDYPARTNER_SMTP_PASSWORD"]
    from_addr = os.environ["STUDYPARTNER_SMTP_FROM"]

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(user, password)
        smtp.send_message(msg)
