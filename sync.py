import json
import pathlib

root = pathlib.Path(__file__).parent


def inject(html: str, marker: str, script_id: str, payload) -> str:
    block = (
        f'<script id="{script_id}" type="application/json">\n'
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + "\n</script>"
    )
    start = html.index(f"<!--{marker}:BEGIN-->") + len(f"<!--{marker}:BEGIN-->")
    end = html.index(f"<!--{marker}:END-->")
    return html[:start] + "\n" + block + "\n" + html[end:]


html_path = root / "index.html"
html = html_path.read_text(encoding="utf-8")
html = inject(html, "DATA", "board-data", json.loads((root / "data.json").read_text(encoding="utf-8")))
planning_path = root / "data" / "planning.json"
planning = json.loads(planning_path.read_text(encoding="utf-8")) if planning_path.exists() else {"days": [], "calendar_sync": {"status": "not_generated"}}
html = inject(html, "PLANNING", "planning-data", planning)
html_path.write_text(html, encoding="utf-8")
print("synced rev", json.loads((root / "data.json").read_text(encoding="utf-8"))["rev"])
