import re, json
html = open('index.html').read()
m = re.search(r'<script type="__bundler/template">([\s\S]*?)<\/script>', html)
decoded = json.loads(m.group(1))
idx = decoded.find('handlePay =')
print(decoded[idx:idx+2500])
