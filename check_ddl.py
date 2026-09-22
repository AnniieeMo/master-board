#!/usr/bin/env python3
"""Daily DDL check: fires macOS notifications for overdue / due-soon items.
Runs via launchd at 20:30 daily. Silent exit when nothing is due."""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

SCHEDULE = Path.home() / "master-board" / "data" / "schedule.json"


def esc(s: str) -> str:
    return s.replace('"', "'").replace("\\", "")


def main() -> int:
    d = json.loads(SCHEDULE.read_text(encoding="utf-8"))
    now = datetime.now()
    notes = []

    for e in d.get("events", []):
        if e.get("status") == "done":
            continue
        if e.get("ddl"):
            try:
                due = datetime.fromisoformat(e["ddl"])
            except ValueError:
                continue
            if due < now:
                notes.append((0, e["title"] + "（DDL）", "已逾期！"))
            elif due - now <= timedelta(hours=48):
                delta = due - now
                days = int(delta.total_seconds() // 86400)
                hours = int(delta.total_seconds() % 86400 // 3600)
                span = f"剩{days}天{hours}小时" if days else f"仅剩{hours}小时"
                text = span + ("（今晚24:00截止！）" if now.weekday() == 6 and due.date() == now.date() else "")
                notes.append((1, e["title"] + "（DDL）", text))
        if e.get("date") and e.get("start") and "考核" in e.get("title", ""):
            try:
                when = datetime.fromisoformat(e["date"] + "T" + e["start"])
            except ValueError:
                continue
            if now <= when <= now + timedelta(days=3):
                notes.append((1, e["title"], f"{e['date'][5:]} {e['start']} 考试"))

    for f in d.get("fixed", []):
        if f.get("kind") != "class":
            continue
        title = f.get("title", "")
        if "考试" not in title and "考核" not in title:
            continue
        try:
            when = datetime.fromisoformat(f["date"] + "T" + f["start"])
        except ValueError:
            continue
        if now <= when <= now + timedelta(days=3):
            notes.append((1, title, f"{f['date'][5:]} {f['start']} 考试"))

    if not notes:
        return 0

    seen, unique = set(), []
    for rank, title, msg in sorted(notes, key=lambda n: n[0]):
        if title not in seen:
            seen.add(title)
            unique.append((rank, title, msg))

    for _, title, msg in unique[:3]:
        text = esc(f"{title} {msg}")
        subprocess.run(
            ["osascript", "-e", f'display notification "{text}" with title "硕士工作台·DDL提醒" sound name "Glass"'],
            check=False,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
