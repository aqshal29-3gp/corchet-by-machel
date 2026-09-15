import json
from pathlib import Path
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

profile = Path('/home/pusdatinkp/.hermes/profiles/pengelola_website')
script_id = '1tltM8gvD-jdyV163DElxnS2Z3x3wrqG9Qwg7Sm243AUmAXOCIrITKb8c'
credentials = Credentials.from_authorized_user_file(str(profile / 'google_token.json'))
service = build('script', 'v1', credentials=credentials)
deployments = service.projects().deployments().list(scriptId=script_id).execute().get('deployments', [])
active = next((d for d in deployments if d.get('entryPoints')), None)
if not active:
    raise SystemExit('No active deployment found')
version = service.projects().versions().create(scriptId=script_id, body={'description': 'ReviewChat Sheet endpoint bfc02e6'}).execute()
updated = service.projects().deployments().update(
    scriptId=script_id,
    deploymentId=active['deploymentId'],
    body={'deploymentConfig': {'versionNumber': version['versionNumber'], 'manifestFileName': 'appsscript', 'description': 'ReviewChat Sheet endpoint bfc02e6'}},
).execute()
print(json.dumps({'deploymentId': updated['deploymentId'], 'versionNumber': version['versionNumber'], 'entryPoints': updated.get('entryPoints', [])}))
