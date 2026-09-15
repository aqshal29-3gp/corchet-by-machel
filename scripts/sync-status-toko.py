#!/usr/bin/env python3
"""Sync Pengaturan TOKO_LIBUR/TOKO_LIBUR_PESAN -> status-toko.json (static).

Idempotent. Fail-safe: on any error, leaves existing status-toko.json
untouched and exits non-zero. Frontend fail-open: missing/unreadable file
means store OPEN (LIBUR=false default preserved).
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "status-toko.json"
SHEET_ID = "1Lta0Um9OUQUaSAlQY495bGL9PXCnTRprIs1xdnUv0GI"
GAPI = "/home/pusdatinkp/.hermes/profiles/pengelola_website/skills/productivity/google-workspace/scripts/google_api.py"
LIBUR_TRUE = {"ya", "yes", "true", "aktif", "active", "1", "libur", "tutup"}
DEFAULT_PESAN = "Mohon maaf, toko sedang dalam perbaikan (maintenance) sistem. Checkout untuk sementara ditutup."


def main():
    raw = subprocess.run(
        ["python", GAPI, "sheets", "get", SHEET_ID, "Pengaturan!A1:B100"],
        capture_output=True, text=True, check=True,
    ).stdout
    rows = json.loads(raw)
    if not rows or [str(c).strip().lower() for c in rows[0][:2]] != ["kunci", "nilai"]:
        raise SystemExit("unexpected Pengaturan header: " + str(rows[:1]))
    cfg = {str(r[0]).strip(): (r[1] if len(r) > 1 else "") for r in rows[1:] if r and str(r[0]).strip()}
    libur = str(cfg.get("TOKO_LIBUR", "tidak")).strip().lower() in LIBUR_TRUE
    pesan = str(cfg.get("TOKO_LIBUR_PESAN", "")).strip() or DEFAULT_PESAN
    OUT.write_text(json.dumps({"libur": libur, "pesan": pesan}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": True, "libur": libur}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)
