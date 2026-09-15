import sys

html_file = "/home/pusdatinkp/machel-rebuild/index.html"
with open(html_file, "r") as f:
    html_code = f.read()

old_fetch = 'fetch("status-toko.json", { cache: "no-store" })'
new_fetch = 'const api = String(this.props.orderApiUrl || "").trim();\n    if (!api) return;\n    fetch(api + "?action=statusToko", { cache: "no-store" })'

if old_fetch in html_code:
    html_code = html_code.replace(old_fetch, new_fetch)
    with open(html_file, "w") as f:
        f.write(html_code)
    print("Patched loadStatusToko!")
else:
    print("Not found old_fetch")
