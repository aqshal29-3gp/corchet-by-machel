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

def search(query, token, developer_token):
    request = urllib.request.Request(
        "https://googleads.googleapis.com/v22/customers/1201748397/googleAds:searchStream",
        data=json.dumps({"query": query}).encode(), method="POST",
        headers={"Authorization": f"Bearer {token}", "developer-token": developer_token, "login-customer-id": "1549151472", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=60) as r: payload = json.loads(r.read())
    rows = []
    for chunk in payload: rows.extend(chunk.get("results", []))
    return rows

token = access_token()
developer_token = env_value(pathlib.Path.home() / ".hermes/.env", "GOOGLE_ADS_DEVELOPER_TOKEN")
rows = search("SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE campaign.name LIKE '%Amigurumi%'", token, developer_token)

for row in rows:
    c = row.get("campaign", {})
    m = row.get("metrics", {})
    print(f"ID: {c.get('id')}, Status: {c.get('status')}, Name: {c.get('name')}")
    print(f"  Clicks: {m.get('clicks', 0)}, Impr: {m.get('impressions', 0)}, Cost: Rp{int(float(m.get('costMicros', 0))/1000000)}")

