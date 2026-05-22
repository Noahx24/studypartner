"""Small CLI for generating a Fernet key for STUDYPARTNER_FERNET_KEY.

Usage:
    python -m app.src.utils.crypto generate-key

Prints a single line: a 44-char url-safe base64 string. Export it as
STUDYPARTNER_FERNET_KEY before booting the backend; rotate by changing
the env var and re-encrypting existing rows (users must reconnect
otherwise).
"""
from __future__ import annotations

import sys

from cryptography.fernet import Fernet


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] != "generate-key":
        print(__doc__, file=sys.stderr)
        return 2
    print(Fernet.generate_key().decode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
