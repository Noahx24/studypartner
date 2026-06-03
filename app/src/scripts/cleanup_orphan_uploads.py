"""Find and remove uploaded files on disk whose DB row no longer exists.

Symptoms of why they exist:
  - User account deletion before delete-cascade was wired (audit-medium #25).
  - Crash between save_upload's disk write and DB INSERT.
  - Schema migration that drops uploads but not files.

The script is idempotent and safe — by default it does a dry run and
prints what it would delete. Pass --apply to actually unlink.

Usage:
    python -m app.src.scripts.cleanup_orphan_uploads        # dry run
    python -m app.src.scripts.cleanup_orphan_uploads --apply
    python -m app.src.scripts.cleanup_orphan_uploads --apply --quiet

Exit codes:
    0   ran cleanly (possibly with orphans found / deleted)
    1   the uploads directory doesn't exist
"""
from __future__ import annotations

import argparse
import sys

from app.storage import UPLOAD_ROOT, get_connection


def find_orphan_uploads() -> tuple[set[str], set[str]]:
    """Return (on_disk, in_db) sets of file paths.

    The orphan set is `on_disk - in_db`. The reverse case (in_db but
    not on disk — broken DB rows pointing at deleted files) is also
    a problem but a different one; that's tracked separately.
    """
    on_disk: set[str] = set()
    if UPLOAD_ROOT.exists():
        for p in UPLOAD_ROOT.iterdir():
            if p.is_file():
                on_disk.add(str(p))

    in_db: set[str] = set()
    with get_connection() as conn:
        for row in conn.execute("SELECT filepath FROM uploads").fetchall():
            in_db.add(row["filepath"])

    return on_disk, in_db


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete orphan files. Default is dry-run.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Only print summary, not the file list.",
    )
    args = parser.parse_args(argv)

    if not UPLOAD_ROOT.exists():
        print(f"Upload root {UPLOAD_ROOT} does not exist — nothing to do.")
        return 1

    on_disk, in_db = find_orphan_uploads()
    orphans = sorted(on_disk - in_db)

    if not orphans:
        print(
            f"Clean. {len(on_disk)} files on disk, {len(in_db)} DB rows, "
            "no orphans."
        )
        return 0

    print(
        f"Found {len(orphans)} orphan file(s) "
        f"({len(on_disk)} on disk, {len(in_db)} DB rows)."
    )
    if not args.quiet:
        for p in orphans:
            print(f"  {p}")

    if not args.apply:
        print("Dry run — pass --apply to actually delete.")
        return 0

    removed = 0
    for path in orphans:
        try:
            __import__("pathlib").Path(path).unlink()
            removed += 1
        except OSError as exc:
            print(f"  WARN: could not delete {path}: {exc}", file=sys.stderr)
    print(f"Deleted {removed}/{len(orphans)} orphan file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
