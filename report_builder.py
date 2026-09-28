#!/usr/bin/env python3
"""Auto-generate last week's report every Monday 08:05 (launchd).
Uses zhipu API for polish if ~/master-board/.llmkey exists, else deterministic text."""

import json
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCHEDULE = ROOT / "data" / "schedule.json"
TODAY = date.today()
WEEKDAY_CN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def dur_of(e):
    try:
        p1, p2 = str(e.get("start", "")).split(":"), str(e.get("end", "")).split(":")
        return max(0, (int(p2[0]) * 60 + int(p2[1])) - (int(p1[0]) * 60 + int(p1[1])))
    except Exception:
        return 60


def main() -> int:
    monday = TODAY - timedelta(days=TODAY.weekday())
    start = monday - timedelta(days=7)
    end = start + timedelta(days=6)
    key = f"{start.year}-W{start.month:02d}{start.day:02d}"

    s = json.loads(SCHEDULE.read_text(encoding="utf-8"))
    for x in s.get("summaries", []):
        if x["week"] == key:
            print("report already exists for", key)
            return 0

    a, b = start.isoformat(), end.isoformat()
    evs = [e for e in s.get("events", []) if a <= e.get("date", "") <= b]
    done = [e for e in evs if e.get("status") == "done"]
    carried = [e for e in evs if e.get("status") != "done"]
    study = sum(dur_of(e) for e in done if e.get("category") in ("course", "skill"))
    work = sum(dur_of(e) for e in done if e.get("category") in ("work", "life"))
    tot = study + work or 1
    stash = [i["text"] for i in s.get("ideas", []) if i.get("status") == "open"]

    text = None
    keyfile = ROOT / ".llmkey"
    if keyfile.exists():
        api = keyfile.read_text(encoding="utf-8").strip()
        if api:
            prompt = (
                f"以下是 {a} 到 {b}（上周）的日程数据。请写一份中文周报，250 字以内，用【】小节标题分四段："
                f"【本周完成】列关键事项；"
                f"【时间占比】工作 {round(work/tot*100)}% / 学习 {round(study/tot*100)}%（按已记录时长），各配一句有观点的点评，不要只报数字；"
                f"【未完成顺延】{'列出这 ' + str(len(carried)) + ' 项：' + json.dumps([e['title'] for e in carried], ensure_ascii=False) if carried else '无，全部清账'}；"
                f"【下周建议】储物仓想法 {json.dumps(stash, ensure_ascii=False)} 里挑 1-2 个建议优先的，另给 1-2 条具体可执行的时间规划改进建议。"
                f"风格要求：像朋友帮你写的周报，不是机器人汇报——开头可以有一句轻松的观察或小吐槽，点评带点态度，避免'保持良好''继续努力'这类空话。活动数据：{json.dumps(evs, ensure_ascii=False)}"
            )
            try:
                req = urllib.request.Request(
                    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
                    data=json.dumps({"model": "glm-5.3-flash", "messages": [{"role": "user", "content": prompt}], "temperature": 0.3}).encode(),
                    headers={"Content-Type": "application/json", "Authorization": "Bearer " + api},
                )
                text = json.load(urllib.request.urlopen(req, timeout=90))["choices"][0]["message"]["content"]
            except Exception as e:
                print("llm polish failed, fallback:", e, file=sys.stderr)

    if not text:
        done_line = "、".join(e["title"] for e in done) if done else "无记录"
        carry_line = "、".join(e["title"] for e in carried) if carried else "无，全部清账"
        stash_line = "；".join(stash) if stash else "空"
        text = (
            f"【本周完成】{done_line}。"
            f"【时间占比】工作 {round(work/tot*100)}% / 学习 {round(study/tot*100)}%（按已记录时长）。"
            f"【未完成顺延】{carry_line}。"
            f"【下周建议】储物仓待消化：{stash_line}。建议先处理有 DDL 的任务，再安排整块学习时间。"
        )

    s.setdefault("summaries", [])
    s["summaries"] = [x for x in s["summaries"] if x["week"] != key]
    s["summaries"].append({"week": key, "text": text, "generated_at": f"{TODAY.isoformat()}T08:05", "source": "auto"})
    SCHEDULE.write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("weekly report generated for", key)
    return 0


if __name__ == "__main__":
    sys.exit(main())
