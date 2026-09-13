#!/usr/bin/env python3
"""Sync GaleriCustom + ReviewChat sheets -> static JSON (no Apps Script dependency).

Why static: the Apps Script web app returns 403 for anonymous visitors, which silently
emptied the custom gallery and chat-review sections on the live site. Reading the sheet
here and committing plain JSON keeps those sections working regardless of Apps Script.

Fail-safe: on any error the existing JSON files are left untouched and exit code is non-zero.
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
JOBS = [("GaleriCustom", "galeri-custom.json"), ("ReviewChat", "review-chat.json")]
HIDDEN = {"tidak", "no", "false", "0"}


def items(values):
    if not values or len(values) < 2:
        raise SystemExit("sheet empty or header only")
    header = values[0]
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
        with tempfile.TemporaryDirectory(prefix=".content-sync-", dir=ROOT) as work:
            work = Path(work)
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
            except Exception:
                for target, backup in reversed(published):
                    if backup.exists():
                        os.replace(backup, target)
                    else:
                        target.unlink(missing_ok=True)
                raise


def main():
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    svc = build("sheets", "v4", credentials=Credentials.from_authorized_user_file(TOKEN),
                cache_discovery=False).spreadsheets().values()
    pending = {}
    for tab, name in JOBS:
        data = items(svc.get(spreadsheetId=SHEET_ID, range=f"{tab}!A1:Z500").execute().get("values", []))
        pending[name] = json.dumps({"items": data}, ensure_ascii=False, indent=2) + "\n"

    publish(pending)
    print(json.dumps({"ok": True, "written": {name: len(json.loads(text)["items"]) for name, text in pending.items()}}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - fail-safe wrapper
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
