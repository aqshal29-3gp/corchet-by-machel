#!/usr/bin/env python3
"""Penjaga jendela patch API Key Mayar (6 Nov 2026, 22:00 WIB).

Mayar mengumumkan patch keamanan mendesak: API key lama tidak bisa dipakai lagi
setelah 22:00. Selama key belum diganti, checkout pelanggan akan gagal. Skrip ini
menutup checkout sebelum jendela patch dan membukanya lagi HANYA kalau key yang
ada di tab Pengaturan benar-benar diterima Mayar.

Mode:
  tutup  -> TOKO_LIBUR=ya + pesan maintenance (nilai lama disimpan dulu)
  cek    -> uji key read-only ke Mayar; kalau 200, kembalikan TOKO_LIBUR & pesan

Read-only terhadap Mayar (endpoint produk, tidak membuat transaksi).
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SHEET_ID = "1Lta0Um9OUQUaSAlQY495bGL9PXCnTRprIs1xdnUv0GI"
TOKEN = Path("/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet/google_token.json")
STATE = Path("/home/pusdatinkp/machel-backups/mayar-guard-state.json")
PESAN_TUTUP = (
    "Mohon maaf, checkout ditutup sebentar (pemeliharaan sistem pembayaran). "
    "Silakan coba lagi sekitar pukul 22.30 WIB ya."
)


def sheets():
    return build(
        "sheets",
        "v4",
        credentials=Credentials.from_authorized_user_file(str(TOKEN)),
        cache_discovery=False,
    ).spreadsheets()


def baca_cfg(svc) -> dict[str, str]:
    rows = (
        svc.values()
        .get(spreadsheetId=SHEET_ID, range="'Pengaturan'!A1:B80")
        .execute()
        .get("values", [])
    )
    return {r[0].strip(): (r[1] if len(r) > 1 else "") for r in rows if r and r[0].strip()}


def tulis(svc, kunci: str, nilai: str) -> None:
    rows = (
        svc.values()
        .get(spreadsheetId=SHEET_ID, range="'Pengaturan'!A1:A80")
        .execute()
        .get("values", [])
    )
    for i, r in enumerate(rows, start=1):
        if r and r[0].strip() == kunci:
            svc.values().update(
                spreadsheetId=SHEET_ID,
                range=f"'Pengaturan'!B{i}",
                valueInputOption="RAW",
                body={"values": [[nilai]]},
            ).execute()
            return
    raise SystemExit(f"FATAL: kunci {kunci} tidak ada di Pengaturan")


def key_valid(key: str) -> tuple[bool, str]:
    if not key:
        return False, "MAYAR_API_KEY kosong"
    req = urllib.request.Request(
        "https://api.mayar.id/hl/v1/product?page=1&pageSize=1",
        headers={"Authorization": "Bearer " + key},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status == 200, f"HTTP {r.status}"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return False, type(e).__name__


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "cek"
    svc = sheets()
    cfg = baca_cfg(svc)

    if mode == "tutup":
        if cfg.get("TOKO_LIBUR", "").strip().lower() in ("ya", "true", "aktif", "1"):
            print("TOKO_LIBUR sudah 'ya' — tidak ada perubahan.")
            return 0
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(
            json.dumps(
                {
                    "toko_libur": cfg.get("TOKO_LIBUR", "tidak"),
                    "pesan": cfg.get("TOKO_LIBUR_PESAN", ""),
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        tulis(svc, "TOKO_LIBUR", "ya")
        tulis(svc, "TOKO_LIBUR_PESAN", PESAN_TUTUP)
        print("Checkout DITUTUP (TOKO_LIBUR=ya). Nilai lama disimpan di " + str(STATE))
        return 0

    ok, info = key_valid(cfg.get("MAYAR_API_KEY", ""))
    if not ok:
        print(
            "Key Mayar BELUM valid (" + info + "). Checkout tetap ditutup.\n"
            "Ganti MAYAR_API_KEY di tab Pengaturan, lalu jalankan ulang: "
            "scripts/mayar-key-guard.py cek"
        )
        return 1

    lama = {"toko_libur": "tidak", "pesan": ""}
    if STATE.is_file():
        try:
            lama.update(json.loads(STATE.read_text(encoding="utf-8")))
        except Exception:  # noqa: BLE001
            pass
    tulis(svc, "TOKO_LIBUR", lama.get("toko_libur") or "tidak")
    if lama.get("pesan"):
        tulis(svc, "TOKO_LIBUR_PESAN", lama["pesan"])
    print(f"Key Mayar VALID ({info}). Checkout DIBUKA kembali (TOKO_LIBUR={lama.get('toko_libur') or 'tidak'}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
