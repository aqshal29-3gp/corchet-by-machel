import json, urllib.request, pathlib, sys, re, urllib.parse

def env_value(path, name):
    pattern = re.compile(rf"\s*(?:export\s+)?{re.escape(name)}\s*=\s*['\"]?([^'\"]*)")
    for line in path.read_text(errors="ignore").splitlines():
        match = pattern.match(line)
        if match: return match.group(1).strip()
    return ""

def access_token():
    config = json.loads((pathlib.Path.home() / ".hermes/profiles/manajer_toko_machelcrochet/google_token.json").read_text())
    body = urllib.parse.urlencode({
        "client_id": config["client_id"], "client_secret": config["client_secret"],
        "refresh_token": config["refresh_token"], "grant_type": "refresh_token"
    }).encode()
    request = urllib.request.Request(config["token_uri"], data=body, method="POST")
    with urllib.request.urlopen(request, timeout=30) as r: return json.loads(r.read())["access_token"]

token = access_token()
developer_token = env_value(pathlib.Path.home() / ".hermes/.env", "GOOGLE_ADS_DEVELOPER_TOKEN")

payload = {
    "operations": [
        {
            "updateMask": "status",
            "update": {
                "resourceName": "customers/1201748397/campaigns/24175389057",
                "status": "ENABLED"
            }
        }
    ]
}

request = urllib.request.Request(
    "https://googleads.googleapis.com/v22/customers/1201748397/campaigns:mutate",
    data=json.dumps(payload).encode(), method="POST",
    headers={"Authorization": f"Bearer {token}", "developer-token": developer_token, "login-customer-id": "1549151472", "Content-Type": "application/json"}
)
try:
    with urllib.request.urlopen(request, timeout=60) as r: 
        print(r.read().decode())
except urllib.error.HTTPError as e:
    print(e.read().decode())
