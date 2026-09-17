#!/usr/bin/env python3
"""Sync fixed blocks (classes + meetings from Apple calendar) into schedule.json.

Agent-run infrastructure: expands data.json courses as fallback, uses the
read-only Apple calendar as primary source. Preserves events/summaries.
"""

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
SCHEDULE_PATH = PROJECT_DIR / "data" / "schedule.json"
HORIZON_DAYS = 110
WEEKDAY_CN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def load_schedule() -> dict:
    if SCHEDULE_PATH.exists():
        return json.loads(SCHEDULE_PATH.read_text(encoding="utf-8"))
    return {"events": [], "fixed": [], "summaries": []}


def calendar_events(today: date) -> list[dict]:
    from engine.apple_calendar import AppleCalendarError, list_apple_calendar_events

    start = datetime(today.year, today.month, today.day)
    end = start + timedelta(days=HORIZON_DAYS)
    try:
        raw = list_apple_calendar_events(start, end)
    except (AppleCalendarError, OSError) as error:
        print("calendar unavailable:", error, file=sys.stderr)
        return []
    fixed = []
    for event in raw:
        if event.get("all_day") or not event.get("scheduled_start") or not event.get("scheduled_end"):
            continue
        fixed.append({
            "date": event["scheduled_date"],
            "start": event["scheduled_start"],
            "end": event["scheduled_end"],
            "title": event.get("title") or "日程",
            "kind": "class" if "暨大" in str(event.get("calendar_name", "")) else "meeting",
        })
    return sorted(fixed, key=lambda b: (b["date"], b["start"]))


def course_fallback(data: dict, today: date) -> list[dict]:
    fixed = []
    for offset in range(HORIZON_DAYS):
        day = today + timedelta(days=offset)
        js_day = day.weekday() + 1
        for course in data.get("courses", []):
            if course["day"] == js_day:
                fixed.append({
                    "date": day.isoformat(),
                    "start": course["start"],
                    "end": course["end"],
                    "title": course["name"],
                    "kind": "class",
                })
    return fixed


def main() -> int:
    today = date.today()
    data = json.loads((PROJECT_DIR / "data.json").read_text(encoding="utf-8"))
    schedule = load_schedule()

    fixed = calendar_events(today)
    source = "apple_calendar"
    if not fixed:
        fixed = course_fallback(data, today)
        source = "course_fallback"

    schedule["fixed"] = fixed
    schedule["fixed_meta"] = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": source,
        "count": len(fixed),
        "horizon_days": HORIZON_DAYS,
    }
    schedule.setdefault("events", [])
    schedule.setdefault("summaries", [])

    SCHEDULE_PATH.parent.mkdir(exist_ok=True)
    SCHEDULE_PATH.write_text(json.dumps(schedule, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"schedule.json: {len(schedule['events'])} events, {len(fixed)} fixed blocks ({source})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
