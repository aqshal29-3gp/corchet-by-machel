import json
from pathlib import Path
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

profile = Path("/home/pusdatinkp/.hermes/profiles/pengelola_website")
credentials = Credentials.from_authorized_user_file(str(profile / "google_token.json"))
service = build("sheets", "v4", credentials=credentials)

try:
    res = service.spreadsheets().get(spreadsheetId="1Lta0Um9OUQUaSAlQY495bGL9PXCnTRprIs1xdnUv0GI").execute()
    for s in res.get("sheets", []):
        props = s.get("properties", {})
        grid = props.get("gridProperties", {})
        print(props.get("title"), grid.get("rowCount"), "rows")
except Exception as e:
    print(e)
