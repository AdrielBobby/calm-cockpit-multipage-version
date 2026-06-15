import os
import pathlib
import subprocess
import xml.etree.ElementTree as ET

ET.register_namespace('', 'http://www.w3.org/2000/svg')
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
ET.register_namespace('sodipodi', 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd')
ET.register_namespace('inkscape', 'http://www.inkscape.org/namespaces/inkscape')

base = pathlib.Path(__file__).parent
original_svg_path = r"C:\Users\adrie\OneDrive\Desktop\Github\adrielbobby.github.io\src\assets\kv-face-logo.svg"

# Parse original SVG
tree = ET.parse(original_svg_path)
root = tree.getroot()

# Find and remove unwanted paths:
# path6 (left side bar), path10 (right side bar), path18 and path20 (bottom-right blue lines)
unwanted_ids = {"path6", "path10", "path18", "path20"}

to_remove = []
for elem in root.iter():
    if elem.attrib.get('id') in unwanted_ids:
        to_remove.append(elem)

for elem in to_remove:
    for parent in root.iter():
        if elem in list(parent):
            parent.remove(elem)
            break

# Create a clean square viewBox
# Original viewBox: 0 0 942.76392 707.52417
# The face is roughly bounded by X: 70 to 910 (width 840), Y: 0 to 600 (height 600).
# We define the new square viewBox as:
# Min X: 21 (gives 21 to 921 for width 900)
# Min Y: -100 (gives -100 to 800 for height 900)
new_root = ET.Element('svg', {
    'version': '1.1',
    'width': '100%',
    'height': '100%',
    'viewBox': '21 -100 900 900',
    'xmlns': 'http://www.w3.org/2000/svg',
    'xmlns:xlink': 'http://www.w3.org/1999/xlink',
    'style': 'background-color: #1a0b3b; border-radius: 20%; display: block;'
})

# Copy defs
defs = root.find('{http://www.w3.org/2000/svg}defs')
if defs is not None:
    new_root.append(defs)

# Move all remaining children (except defs/namedview) into the new root
for child in list(root):
    if child.tag != '{http://www.w3.org/2000/svg}defs' and child.tag != '{http://www.w3.org/2000/svg}namedview':
        new_root.append(child)

output_svg = base / "kv-icon.svg"
new_tree = ET.ElementTree(new_root)
new_tree.write(str(output_svg), encoding='utf-8', xml_declaration=True)

# Render sizes using Edge
edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
temp_html = base / "temp_render.html"

sizes = {
    "apple-touch-icon.png": 180,
    "favicon-32x32.png": 32
}

for filename, size in sizes.items():
    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {{
    margin: 0 !important;
    padding: 0 !important;
    width: {size}px !important;
    height: {size}px !important;
    overflow: hidden !important;
    background: transparent !important;
  }}
  svg {{
    width: {size}px !important;
    height: {size}px !important;
    display: block !important;
  }}
</style>
</head>
<body>
  {ET.tostring(new_root, encoding='utf-8').decode('utf-8')}
</body>
</html>
"""
    temp_html.write_text(html_content, encoding='utf-8')

    output_png = base / filename
    cmd = [
        edge_path,
        "--headless",
        "--disable-gpu",
        f"--window-size={size},{size}",
        "--hide-scrollbars",
        f"--screenshot={str(output_png)}",
        str(temp_html)
    ]
    subprocess.run(cmd, check=True)
    print(f"  OK  {filename} ({size}x{size}) -> {output_png}")

# Cleanup temp html
if temp_html.exists():
    os.remove(temp_html)

print("\nDone.")
