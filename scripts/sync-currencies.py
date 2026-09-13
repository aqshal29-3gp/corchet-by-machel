#!/usr/bin/env python3
"""Sync MataUang sheet -> currencies.json (static, no Apps Script deploy needed).
Idempotent. Only IDR/SGD/MYR, aktif rows. Comma-decimals parsed. IDR forced base=1.
Fails safe: on any error, leaves existing currencies.json untouched and exits non-zero."""
import json, subprocess, sys, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "currencies.json"
SHEET_ID = "1Lta0Um9OUQUaSAlQY495bGL9PXCnTRprIs1xdnUv0GI"
GAPI = "/home/pusdatinkp/.hermes/profiles/pengelola_website/skills/productivity/google-workspace/scripts/google_api.py"
ALLOWED = {"IDR", "SGD", "MYR"}
SIMBOL = {"IDR": "Rp", "SGD": "S$", "MYR": "RM"}


def num(s):
    s = str(s).strip().replace(".", "").replace(",", ".") if "," in str(s) else str(s).strip()
    return float(s)


def main():
    raw = subprocess.run(
        ["python", GAPI, "sheets", "get", SHEET_ID, "MataUang!A1:E50"],
        capture_output=True, text=True, check=True,
    ).stdout
    rows = json.loads(raw)
    if not rows or rows[0][:1] != ["kode"]:
        raise SystemExit("unexpected MataUang header: " + str(rows[:1]))
    hdr = rows[0]
    items = []
    for r in rows[1:]:
        rec = dict(zip(hdr, r))
        kode = str(rec.get("kode", "")).strip().upper()
        if kode not in ALLOWED:
            continue
        if re.match(r"^(tidak|no|false|0)$", str(rec.get("aktif", "ya")).strip(), re.I):
            continue
        kurs = 1.0 if kode == "IDR" else num(rec.get("kurs", 0))
        if not kurs > 0:
            continue
        items.append({"kode": kode, "kurs": kurs, "simbol": SIMBOL[kode],
                      "aktif": "ya", "diperbarui": str(rec.get("diperbarui", ""))})
    if not any(x["kode"] == "IDR" for x in items):
        raise SystemExit("IDR missing/inactive; refusing to write")
    OUT.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": True, "written": [x["kode"] for x in items]}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)
