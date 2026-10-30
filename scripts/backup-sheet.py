#!/usr/bin/env python3
"""Backup harian seluruh tab spreadsheet operasional ke JSON.

Read-only terhadap spreadsheet: hanya membaca, tidak pernah menulis.
Simpan di /home/pusdatinkp/machel-backups/sheets/YYYY-MM-DD.json,
pertahankan 30 hari terakhir, lalu hapus yang lebih lama.

Jalankan dari cron:
  cd /home/pusdatinkp/machel-rebuild && ./.venv-sync/bin/python3 scripts/backup-sheet.py
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SHEET_ID = "1Lta0Um9OUQUaSAlQY495bGL9PXCnTRprIs1xdnUv0GI"
OUT_DIR = Path("/home/pusdatinkp/machel-backups/sheets")
SIMPAN_HARI = 30

TOKEN_CANDIDATES = [
    Path("/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet/google_token.json"),
    Path("/home/pusdatinkp/.hermes/profiles/pengelola_website/google_token.json"),
]


def token_path() -> Path:
    for p in TOKEN_CANDIDATES:
        if p.is_file():
            return p
    raise SystemExit("FATAL: google_token.json tidak ditemukan di kandidat mana pun")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    svc = build(
        "sheets",
        "v4",
        credentials=Credentials.from_authorized_user_file(str(token_path())),
        cache_discovery=False,
    ).spreadsheets()

    meta = svc.get(spreadsheetId=SHEET_ID, fields="sheets.properties(title)").execute()
    tabs = [s["properties"]["title"] for s in meta["sheets"]]

    hasil = {}
    for tab in tabs:
        try:
            res = (
                svc.values()
                .get(spreadsheetId=SHEET_ID, range=f"'{tab}'!A1:Z5000")
                .execute()
                .get("values", [])
            )
            hasil[tab] = res
        except Exception as exc:  # satu tab gagal tidak membatalkan seluruh backup
            hasil[tab] = {"error": str(exc)[:200]}

    hari_ini = date.today().isoformat()
    target = OUT_DIR / f"{hari_ini}.json"
    payload = {
        "spreadsheet_id": SHEET_ID,
        "diambil": datetime.now().isoformat(timespec="seconds"),
        "tabs": hasil,
    }
    tmp = target.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, target)

    # rotasi: simpan N hari terakhir saja
    berkas = sorted(OUT_DIR.glob("20*.json"))
    for lama in berkas[:-SIMPAN_HARI]:
        try:
            lama.unlink()
        except OSError:
            pass

    total_baris = sum(len(v) for v in hasil.values() if isinstance(v, list))
    print(
        json.dumps(
            {
                "ok": True,
                "file": str(target),
                "tabs": len(tabs),
                "baris": total_baris,
                "ukuran_kb": round(target.stat().st_size / 1024, 1),
                "tersimpan": len(berkas[-SIMPAN_HARI:]),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
