import urllib.request
import re
html = urllib.request.urlopen("http://127.0.0.1:5000").read().decode("utf-8")
tiles = re.findall(r"<div class='tile tile-4-col'.*?</div>\s*</div>", html.replace('"', "'"), re.DOTALL)
if tiles:
    print(tiles[0])
else:
    print("No tiles found")
