import json
from pathlib import Path
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

profile = Path("/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet")
script_id = "1tltM8gvD-jdyV163DElxnS2Z3x3wrqG9Qwg7Sm243AUmAXOCIrITKb8c"
credentials = Credentials.from_authorized_user_file(str(profile / "google_token.json"))
service = build("script", "v1", credentials=credentials)

try:
    res = service.processes().listScriptProcesses(scriptId=script_id, pageSize=10).execute()
    for p in res.get("processes", []):
        print(p.get("functionName"), p.get("processStatus"), p.get("duration"))
except Exception as e:
    print(e)
