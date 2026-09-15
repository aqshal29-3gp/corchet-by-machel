import json
html = open('index.html').read()
import re
m = re.search(r'<script type="__bundler/template">([\s\S]*?)<\/script>', html)
decoded = json.loads(m.group(1))
idx = decoded.find('Mengarahkan')
print(decoded[idx-100:idx+200])
