import json
import pathlib

root = pathlib.Path(__file__).parent

schedule_path = root / "data" / "schedule.json"
schedule = (
    json.loads(schedule_path.read_text(encoding="utf-8"))
    if schedule_path.exists()
    else {"events": [], "fixed": [], "summaries": []}
)

html_path = root / "index.html"
html = html_path.read_text(encoding="utf-8")
block = (
    '<script id="seed-data" type="application/json">\n'
    + json.dumps(schedule, ensure_ascii=False, indent=2)
    + "\n</script>"
)
start = html.index("<!--SEED:BEGIN-->") + len("<!--SEED:BEGIN-->")
end = html.index("<!--SEED:END-->")
html_path.write_text(html[:start] + "\n" + block + "\n" + html[end:], encoding="utf-8")
print("seeded:", len(schedule["events"]), "events,", len(schedule["fixed"]), "fixed")
