#!/usr/bin/env python3
"""Sync GaleriCustom + ReviewChat sheets -> static JSON (no Apps Script dependency).

Why static: the Apps Script web app returns 403 for anonymous visitors, which silently
emptied the custom gallery and chat-review sections on the live site. Reading the sheet
here and committing plain JSON keeps those sections working regardless of Apps Script.

Fail-safe: on any source or validation error the existing JSON files are left untouched
and exit code is non-zero. Publish uses a per-run staging directory under an
exclusive lock; if a replace fails, already-published files are restored from
staged backups. If the rollback itself fails, the staging directory (with
backups) is preserved and a RuntimeError names its path.
"""
import fcntl
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKEN = "/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet/google_token.json"
SHEET_ID = "1Lta0Um9OUQUaSAlQY495bGL9PXCnTRprIs1xdnUv0GI"
JOBS = [
    ("GaleriCustom", "galeri-custom.json", {"judul", "fotoRequest", "fotoJadi", "tampil"}),
    ("ReviewChat", "review-chat.json", {"gambar", "tampil"}),
]
HIDDEN = {"tidak", "no", "false", "0"}


def items(values, required):
    if not values:
        raise SystemExit("sheet empty")
    header = values[0]
    missing = required - set(header)
    if missing:
        raise SystemExit("unexpected sheet header; missing: " + ", ".join(sorted(missing)))
    rows = []
    for raw in values[1:]:
        rec = dict(zip(header, list(raw) + [""] * (len(header) - len(raw))))
        if str(rec.get("tampil", "ya")).strip().lower() in HIDDEN:
            continue
        rows.append(rec)
    rows.sort(key=lambda r: int(str(r.get("urutan", "99")).strip() or 99))
    return rows


def publish(pending):
    """Publish all outputs as one recoverable, single-run transaction."""
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / ".sync-content.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        work = Path(tempfile.mkdtemp(prefix=".content-sync-", dir=ROOT))
        try:
            staged = []
            for name, text in pending.items():
                target = ROOT / name
                new = work / (name + ".new-sync-content")
                backup = work / (name + ".old-sync-content")
                new.write_text(text)
                if target.exists():
                    shutil.copy2(target, backup)
                staged.append((new, target, backup))

            published = []
            try:
                for new, target, backup in staged:
                    os.replace(new, target)
                    published.append((target, backup))
            except Exception as publish_error:
                try:
                    for target, backup in reversed(published):
                        if backup.exists():
                            os.replace(backup, target)
                        else:
                            target.unlink(missing_ok=True)
                except Exception as rollback_error:
                    raise RuntimeError(
                        f"publish failed; rollback failed; backups preserved in {work}"
                    ) from ExceptionGroup("publish and rollback failures", [publish_error, rollback_error])
                shutil.rmtree(work)
                raise
        except Exception:
            raise
        else:
            shutil.rmtree(work)


def main():
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    svc = build("sheets", "v4", credentials=Credentials.from_authorized_user_file(TOKEN),
                cache_discovery=False).spreadsheets().values()
    pending = {}
    for tab, name, required in JOBS:
        data = items(
            svc.get(spreadsheetId=SHEET_ID, range=f"{tab}!A1:Z500").execute().get("values", []),
            required,
        )
        pending[name] = json.dumps({"items": data}, ensure_ascii=False, indent=2) + "\n"

    publish(pending)
    print(json.dumps({"ok": True, "written": {name: len(json.loads(text)["items"]) for name, text in pending.items()}}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - fail-safe wrapper
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
