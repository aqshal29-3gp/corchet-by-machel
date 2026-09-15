import urllib.request
import json
import time

url = "https://script.google.com/macros/s/AKfycbxlkjMNeSuXzfSZUsWg2vO-gQIo0NpP9L7NGxHPsJvj-DH8Rl3J5uxT-uIIUb1MZ3lm/exec?action=statusToko"
start = time.time()
try:
    with urllib.request.urlopen(url, timeout=30) as r:
        print("GET Time:", time.time() - start)
        print("Body:", r.read().decode()[:200])
except Exception as e:
    print("GET Error:", e)

