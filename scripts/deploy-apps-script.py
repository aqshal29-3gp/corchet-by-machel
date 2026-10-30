#!/usr/bin/env python3
"""Deploy Apps Script dari file .gs di repo.

Alur: baca isi project -> ganti file `Code` dengan isi repo -> updateContent ->
buat versi baru -> arahkan deployment web app ke versi itu.

Contoh:
  ./.venv-sync/bin/python3 scripts/deploy-apps-script.py --cek
  ./.venv-sync/bin/python3 scripts/deploy-apps-script.py --kirim
"""
import argparse
import json
import sys
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCRIPT_ID = "1tltM8gvD-jdyV163DElxnS2Z3x3wrqG9Qwg7Sm243AUmAXOCIrITKb8c"
DEPLOYMENT_ID = ("AKfycbw8nd_MeUvlIRucxz2CR5YFxU5Wt78Hl8rBfxiq85MIiJkBfyAw0iK5YitBMne6m3d8")
REPO = Path(__file__).resolve().parent.parent
SUMBER = REPO / "AppsScript-GaleriCustom.gs"
TOKEN = Path("/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet/google_token.json")


def layanan():
    kredensial = Credentials.from_authorized_user_file(str(TOKEN))
    return build("script", "v1", credentials=kredensial, cache_discovery=False)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--kirim", action="store_true", help="benar-benar mengunggah dan deploy")
    p.add_argument("--cek", action="store_true", help="hanya bandingkan isi repo vs live")
    a = p.parse_args()

    kode_baru = SUMBER.read_text(encoding="utf-8")
    svc = layanan()
    isi = svc.projects().getContent(scriptId=SCRIPT_ID).execute()
    berkas = isi.get("files", [])
    nama = [f["name"] for f in berkas]
    kode_live = next((f["source"] for f in berkas if f["name"] == "Code"), "")

    print(f"file di project : {nama}")
    print(f"Code live       : {len(kode_live)} char")
    print(f"Code repo       : {len(kode_baru)} char")
    if kode_live == kode_baru:
        print("Sama persis — tidak ada yang perlu dikirim.")
        if not a.kirim:
            return
    elif not a.kirim:
        print("BEDA. Jalankan dengan --kirim untuk mengunggah.")
        return

    if not a.kirim:
        return

    for f in berkas:
        if f["name"] == "Code":
            f["source"] = kode_baru
    svc.projects().updateContent(scriptId=SCRIPT_ID, body={"files": berkas}).execute()
    print("1) updateContent OK")

    versi = svc.projects().versions().create(
        scriptId=SCRIPT_ID, body={"description": "deploy repo " + SUMBER.name}
    ).execute()
    nomor = versi["versionNumber"]
    print(f"2) versi baru: {nomor}")

    svc.projects().deployments().update(
        scriptId=SCRIPT_ID,
        deploymentId=DEPLOYMENT_ID,
        body={"deploymentConfig": {"scriptId": SCRIPT_ID, "versionNumber": nomor}},
    ).execute()
    print(f"3) deployment web app -> versi {nomor}")


if __name__ == "__main__":
    sys.exit(main())
