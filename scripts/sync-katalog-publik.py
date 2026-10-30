#!/usr/bin/env python3
"""Sinkronkan tab Produk (sheet privat) -> sheet katalog publik.

Sheet privat  : sumber kebenaran katalog (CROCHET BY MACHEL).
Sheet publik  : hanya tab Produk, dibaca website via gviz CSV.

Aman: jika pembacaan gagal, sheet publik tidak disentuh.
Idempoten: hanya menulis bila isi berbeda (atau --force).
"""
import fcntl
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKEN = "/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet/google_token.json"
SUMBER = "1Lta0Um9OUQUaSAlQY495bGL9PXCnTRprIs1xdnUv0GI"   # privat
PUBLIK = "1eQKHXKKt294lecdPLyRTrXHK99xE-00STLWLXi9j5AE"   # katalog publik
TAB = "Produk"
RANGE = f"{TAB}!A1:Z1000"


def baca(svc, sid):
    return svc.get(spreadsheetId=sid, range=RANGE).execute().get("values", [])


def main():
    force = "--force" in sys.argv
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    svc = build("sheets", "v4", credentials=Credentials.from_authorized_user_file(TOKEN),
                cache_discovery=False).spreadsheets().values()

    sumber = baca(svc, SUMBER)
    if not sumber or len(sumber) < 2:
        raise SystemExit("sumber kosong / tidak terbaca; sheet publik tidak diubah")

    publik = baca(svc, PUBLIK)
    if not force and publik == sumber:
        print(json.dumps({"ok": True, "changed": False, "rows": len(sumber)}))
        return

    svc.clear(spreadsheetId=PUBLIK, range=f"{TAB}!A1:Z1000", body={}).execute()
    svc.update(spreadsheetId=PUBLIK, range=f"{TAB}!A1", valueInputOption="RAW",
               body={"values": sumber}).execute()

    cek = baca(svc, PUBLIK)
    if cek != sumber:
        raise SystemExit("verifikasi gagal: isi publik != sumber")
    print(json.dumps({"ok": True, "changed": True, "rows": len(sumber)}))


if __name__ == "__main__":
    lock_path = ROOT / ".sync-katalog-publik.lock"
    try:
        with lock_path.open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            main()
    except BlockingIOError:
        print(json.dumps({"ok": False, "error": "lock held"}))
        sys.exit(2)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
