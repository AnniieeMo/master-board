import json
import pathlib

root = pathlib.Path(__file__).parent
data = json.loads((root / "data.json").read_text(encoding="utf-8"))

html_path = root / "index.html"
html = html_path.read_text(encoding="utf-8")

block = (
    '<script id="board-data" type="application/json">\n'
    + json.dumps(data, ensure_ascii=False, indent=2)
    + "\n</script>"
)

start = html.index("<!--DATA:BEGIN-->") + len("<!--DATA:BEGIN-->")
end = html.index("<!--DATA:END-->")
html_path.write_text(html[:start] + "\n" + block + "\n" + html[end:], encoding="utf-8")
print("synced rev", data["rev"])
