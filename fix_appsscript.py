import json
from pathlib import Path
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

profile = Path('/home/pusdatinkp/.hermes/profiles/pengelola_website')
script_id = '1tltM8gvD-jdyV163DElxnS2Z3x3wrqG9Qwg7Sm243AUmAXOCIrITKb8c'
credentials = Credentials.from_authorized_user_file(str(profile / 'apps_script_token.json'))
service = build('script', 'v1', credentials=credentials)

# 1. Update code
current = service.projects().getContent(scriptId=script_id).execute()
files = []
for item in current.get('files', []):
    if item.get('type') == 'SERVER_JS' and item.get('name') == 'Tanpa judul':
        item = dict(item)
        item['source'] = Path('/home/pusdatinkp/machel-rebuild/AppsScript-GaleriCustom.gs').read_text()
    files.append({key: item[key] for key in ('name', 'type', 'source') if key in item})
service.projects().updateContent(scriptId=script_id, body={'files': files}).execute()
print("Code updated.")

# 2. Deploy
deployments = service.projects().deployments().list(scriptId=script_id).execute().get('deployments', [])
active = next((d for d in deployments if d.get('entryPoints')), None)
if not active:
    print("No active deployment found")
else:
    version = service.projects().versions().create(scriptId=script_id, body={'description': 'Auto deploy'}).execute()
    updated = service.projects().deployments().update(
        scriptId=script_id,
        deploymentId=active['deploymentId'],
        body={'deploymentConfig': {'versionNumber': version['versionNumber'], 'manifestFileName': 'appsscript', 'description': 'Auto deploy'}}
    ).execute()
    print("Deployed.")
    web_app_url = ""
    for ep in updated.get('entryPoints', []):
        if ep.get('webAppConfig'):
            web_app_url = ep.get('webAppConfig').get('url')
    print("Web App URL:", web_app_url)
