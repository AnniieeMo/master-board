#!/usr/bin/env python3
"""Nightly rollover: move yesterday's (and older) unfinished dated tasks into
the next free slots, avoiding fixed blocks and existing events."""

import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCHEDULE = ROOT / "data" / "schedule.json"
WINDOW = (9 * 60, 23 * 60)
MAX_DAYS = 8


def to_m(v):
    p = str(v).split(":")
    return int(p[0]) * 60 + int(p[1])


def fmt(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def main() -> int:
    today = date.today()
    s = json.loads(SCHEDULE.read_text(encoding="utf-8"))
    events = s.get("events", [])

    carried = [e for e in events
               if e.get("date") and e["date"] < today.isoformat()
               and e.get("status") != "done" and e.get("start")]
    if not carried:
        print("rollover: nothing to carry")
        return 0

    moved = 0
    for e in sorted(carried, key=lambda x: (x["date"], x.get("start") or "99:99")):
        orig = e["date"]
        dur = max(30, to_m(e["end"]) - to_m(e["start"])) if e.get("end") else 60
        placed = False
        for offset in range(MAX_DAYS):
            day = today + timedelta(days=offset)
            day_iso = day.isoformat()
            busy = []
            for f in s.get("fixed", []):
                if f["date"] == day_iso:
                    busy.append((to_m(f["start"]), to_m(f["end"])))
            for o in events:
                if o.get("date") == day_iso and o.get("status") != "done" and o.get("start") and o.get("end"):
                    busy.append((to_m(o["start"]), to_m(o["end"])))
            busy.sort()
            slots = []
            cur = WINDOW[0]
            for b0, b1 in busy:
                if b0 - cur >= dur:
                    slots.append((cur, b0))
                cur = max(cur, b1)
            if WINDOW[1] - cur >= dur:
                slots.append((cur, WINDOW[1]))
            if not slots:
                continue
            start = slots[0][0]
            e["date"] = day_iso
            e["start"] = fmt(start)
            e["end"] = fmt(start + dur)
            notes = re.sub(r"（自动顺延自 [\d-]+）", "", e.get("notes") or "").strip()
            e["notes"] = (notes + f" （自动顺延自 {orig[5:]}）").strip()
            placed = True
            moved += 1
            break
        if not placed:
            print(f"rollover: could not place '{e['title']}' within {MAX_DAYS} days", file=sys.stderr)

    SCHEDULE.write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"rollover moved {moved} task(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
