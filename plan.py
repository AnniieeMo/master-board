#!/usr/bin/env python3
"""Generate a static study schedule from data.json tasks.

Plan A architecture: the agent runs this locally; output is a plain JSON file
injected into the static page. No server, no secrets.
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from engine.apple_calendar import AppleCalendarError, list_apple_calendar_events
from engine.core import build_day_plan

PROJECT_DIR = Path(__file__).resolve().parent
WEEKDAY_CN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

BASE_POLICY = {
    "timezone": "Asia/Shanghai",
    "work_windows": [("09:30", "13:00"), ("14:30", "18:30")],
    "study_windows": [("20:00", "24:00")],
    "work_soft_capacity_minutes": 270,
    "study_soft_capacity_minutes": 120,
    "default_work_duration_minutes": 45,
    "default_study_duration_minutes": 35,
    "slot_granularity_minutes": 5,
    "max_automatic_carries": 3,
    "working_weekdays": [0, 1, 2, 3, 4],
}
WEEKEND_POLICY = dict(BASE_POLICY, study_windows=[("09:30", "12:00"), ("14:00", "18:00"), ("20:00", "24:00")])


def sync_calendar(today: date) -> dict:
    start = datetime(today.year, today.month, 1)
    if today.month == 12:
        end = datetime(today.year + 1, 1, 1)
    else:
        end = datetime(today.year, today.month + 2, 1)
    try:
        events = list_apple_calendar_events(start, end)
        return {"status": "available", "imported": len(events), "events": events}
    except (AppleCalendarError, OSError) as error:
        return {"status": "unavailable", "imported": 0, "events": [], "error": str(error)}


def minutes(value: str) -> int:
    hour, minute = map(int, value.split(":"))
    return hour * 60 + minute


def fixed_blocks_for(day: date, data: dict, calendar: dict) -> list[dict]:
    blocks = []
    if calendar.get("status") == "available":
        for event in calendar["events"]:
            if event.get("allDay") or not event.get("scheduledStart") or not event.get("scheduledEnd"):
                continue
            if event.get("scheduledDate") != day.isoformat():
                continue
            blocks.append({
                "start": event["scheduledStart"],
                "end": event["scheduledEnd"],
                "title": event.get("title") or "日程",
                "type": "class" if "暨大" in str(event.get("calendarName", "")) else "meeting",
            })
    else:
        js_day = day.weekday() + 1
        for course in data.get("courses", []):
            if course["day"] == js_day:
                blocks.append({"start": course["start"], "end": course["end"], "title": course["name"], "type": "class"})
    return sorted(blocks, key=lambda b: minutes(b["start"]))


def homework_requests(data: dict, today: date, horizon_end: date) -> list[dict]:
    """One request = one study block on a specific day, with retry-until-due semantics."""
    requests = []
    for task in data.get("tasks", []):
        if task.get("kind") not in {"homework"} or task.get("status") == "done":
            continue
        due = date.fromisoformat(task["due"][:10])
        days_left = (due - today).days
        if days_left < 0:
            continue
        days_left = min(days_left, (horizon_end - today).days)
        label = task["title"]
        if days_left <= 3:
            requests.append({"day": 0, "duration": 60, "priority": "high", "title": label, "course": task["course"], "kind": "homework", "retry_until": min(days_left, (horizon_end - today).days)})
        elif days_left <= 10:
            start_day = max(1, days_left - 3)
            requests.append({"day": start_day, "duration": 60, "priority": "normal", "title": label, "course": task["course"], "kind": "homework", "retry_until": days_left})
        else:
            offset = 0
            while offset <= days_left:
                day = today + timedelta(days=offset)
                if day.weekday() == 6:
                    requests.append({"day": offset, "duration": 60, "priority": "normal", "title": f"{label} · 每周推进", "course": task["course"], "kind": "homework", "retry_until": min(offset + 2, days_left)})
                offset += 1
    for task in data.get("tasks", []):
        if task.get("kind") != "exam":
            continue
        exam = date.fromisoformat(task["due"][:10])
        for lead in (7, 4, 2, 1):
            offset = (exam - today).days - lead
            if 0 <= offset <= (horizon_end - today).days:
                requests.append({"day": offset, "duration": 45, "priority": "high" if lead <= 2 else "normal", "title": f"{task['title']}复习", "course": task["course"], "kind": "exam", "retry_until": offset})
    return requests


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--horizon", type=int, default=14)
    args = parser.parse_args()

    data = json.loads((PROJECT_DIR / "data.json").read_text(encoding="utf-8"))
    today = date.today()
    horizon_end = today + timedelta(days=args.horizon - 1)

    calendar = sync_calendar(today)
    calendar_events = calendar.pop("events", [])
    requests = homework_requests(data, today, horizon_end)

    by_day: dict[int, list[dict]] = {}
    for index, request in enumerate(requests):
        request["id"] = f"req-{index:03d}"
        by_day.setdefault(request["day"], []).append(request)

    days = []
    pending: list[dict] = []
    for offset in range(args.horizon):
        day = today + timedelta(days=offset)
        policy = WEEKEND_POLICY if day.weekday() >= 5 else BASE_POLICY
        fixed = fixed_blocks_for(day, data, calendar)
        blockers = [
            {
                "id": f"blocker-{index}",
                "title": block["title"],
                "kind": "work",
                "status": "confirmed",
                "duration_minutes": minutes(block["end"]) - minutes(block["start"]),
                "scheduled_date": day.isoformat(),
                "scheduled_start": block["start"],
                "scheduled_end": block["end"],
                "counts_towards_capacity": False,
            }
            for index, block in enumerate(fixed)
        ]
        queue = pending + by_day.get(offset, [])
        payload = [
            {
                "id": r["id"],
                "title": r["title"],
                "kind": "study",
                "duration_minutes": r["duration"],
                "priority": r["priority"],
                "status": "todo",
                "target_date": day.isoformat(),
            }
            for r in queue
        ]
        plan = build_day_plan([*blockers, *payload], day, policy)
        scheduled, warnings, still_pending = [], [], []
        for task in plan["tasks"]:
            if task["id"].startswith("blocker-"):
                continue
            meta = next(r for r in queue if r["id"] == task["id"])
            if task.get("schedule_state") == "proposed":
                scheduled.append({"start": task["scheduled_start"], "end": task["scheduled_end"], "title": meta["title"], "course": meta["course"], "type": meta["kind"]})
            elif offset < meta["retry_until"]:
                still_pending.append(meta)
            else:
                warnings.append(f"{meta['title']}：本日未能安排（{task.get('schedule_note') or '无可用时段'}）")
        pending = still_pending
        if pending:
            warnings.append(f"{len(pending)} 个时间块顺延到下一天")
        days.append({
            "date": day.isoformat(),
            "weekday": WEEKDAY_CN[day.weekday()],
            "fixed": fixed,
            "blocks": sorted(scheduled, key=lambda b: minutes(b["start"])),
            "load_minutes": plan["load_minutes"]["study"],
            "capacity_minutes": policy["study_soft_capacity_minutes"],
            "warnings": warnings,
        })

    output = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "horizon_days": args.horizon,
        "calendar_sync": {"status": calendar["status"], "imported": calendar["imported"], **({"error": calendar["error"]} if calendar.get("error") else {})},
        "days": days,
    }
    out_path = PROJECT_DIR / "data" / "planning.json"
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"planning.json written: {len(days)} days, calendar {calendar['status']} ({calendar['imported']} events)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
