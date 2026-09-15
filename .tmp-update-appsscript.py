import json
from pathlib import Path
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

profile = Path('/home/pusdatinkp/.hermes/profiles/pengelola_website')
script_id = '1tltM8gvD-jdyV163DElxnS2Z3x3wrqG9Qwg7Sm243AUmAXOCIrITKb8c'
scopes = ['https://www.googleapis.com/auth/script.projects']
credentials = Credentials.from_authorized_user_file(str(profile / 'apps_script_token.json'), scopes)
service = build('script', 'v1', credentials=credentials)
current = service.projects().getContent(scriptId=script_id).execute()
backup = profile / 'apps-script-backup' / script_id
backup.mkdir(parents=True, exist_ok=True)
for item in current.get('files', []):
    suffix = {'SERVER_JS': '.gs', 'HTML': '.html', 'JSON': '.json'}.get(item.get('type'), '.txt')
    (backup / f"{item['name']}{suffix}.before-reviewchat").write_text(item.get('source', ''))
files = []
for item in current.get('files', []):
    if item.get('type') == 'SERVER_JS' and item.get('name') == 'Tanpa judul':
        item = dict(item)
        item['source'] = Path('AppsScript-GaleriCustom.gs').read_text()
    files.append({key: item[key] for key in ('name', 'type', 'source') if key in item})
result = service.projects().updateContent(scriptId=script_id, body={'files': files}).execute()
print(json.dumps({'scriptId': result.get('scriptId'), 'files': [f['name'] for f in result.get('files', [])], 'backup': str(backup)}))
