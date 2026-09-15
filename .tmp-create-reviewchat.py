import sys
sys.path.insert(0, '/home/pusdatinkp/.hermes/profiles/pengelola_website/skills/productivity/google-workspace/scripts')
import google_api
sheet_id = '1Lta0Um9OUQUaSAlQY495bGL9PXCnTRprIs1xdnUv0GI'
service = google_api.build_service('sheets', 'v4')
result = service.spreadsheets().batchUpdate(
    spreadsheetId=sheet_id,
    body={'requests': [{'addSheet': {'properties': {'title': 'ReviewChat'}}}]},
).execute()
print(result['replies'][0]['addSheet']['properties'])
