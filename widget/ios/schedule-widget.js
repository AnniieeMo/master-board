// MASTER·BOARD iPhone 小组件 — Scriptable（全天版）
// 安装：App Store 下载 Scriptable → 新建脚本 → 粘贴本文件 → 运行
// 长按桌面 → 添加小组件 → Scriptable → 选择本脚本；点小组件直达工作台
// iOS 系统调度刷新（约15分钟+）；想立刻刷新就打开 Scriptable 跑一次本脚本

const URL_ = "https://anniieemo.github.io/master-board/data/schedule.json";

const pad = n => (n < 10 ? "0" + n : "" + n);
const todayIso = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
const mins = v => { const p = String(v || "00:00").split(":").map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };

const CatColor = { skill: new Color("#2f7d3c"), course: new Color("#2f7a8f"), work: new Color("#b9791f"), life: new Color("#8f8871") };

async function fetchData() {
  try {
    const req = new Request(URL_);
    const data = await req.loadJSON();
    return { data, fetched: true };
  } catch (e) {
    return { data: { events: [], fixed: [] }, fetched: false };
  }
}

function dayItems(data) {
  const t = todayIso();
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const fixed = (data.fixed || []).filter(f => f.date === t);
  const events = (data.events || []).filter(e => e.date === t);
  const items = [
    ...fixed.map(f => ({ time: f.start, end: f.end, title: f.title, fixed: true, done: false })),
    ...events.map(e => ({ time: e.start || "00:00", end: e.end || "", title: e.title, fixed: false, done: e.status === "done" }))
  ].sort((a, b) => mins(a.time) - mins(b.time));
  return items.map(it => {
    const m = mins(it.time), e2 = mins(it.end || "23:59");
    return { ...it, past: e2 <= nowM || it.done, now: !it.done && m <= nowM && nowM < e2 };
  });
}

function nextUp(data) {
  const t = todayIso();
  const list = (data.events || [])
    .filter(e => e.status !== "done" && e.date >= t)
    .sort((a, b) => (a.date + (a.start || "00:00")) < (b.date + (b.start || "00:00")) ? -1 : 1);
  return list[0] || null;
}

function ddlLine(data) {
  const list = (data.events || [])
    .filter(e => e.ddl && e.status !== "done")
    .sort((a, b) => (a.ddl < b.ddl ? -1 : 1));
  return list[0] || null;
}

function addRow(w, it) {
  const time = it.time + "-" + (it.end || "----");
  const prefix = it.done ? "✓ " : it.now ? "▶ " : "";
  const line = w.addText(time + "  " + prefix + it.title);
  line.font = it.fixed ? Font.systemFont(11) : Font.semiboldSystemFont(11);
  line.textColor = it.past ? new Color("#8f8871") : it.now ? new Color("#b9791f") : new Color("#33312a");
  line.lineLimit = 1;
}

async function createWidget() {
  const { data, fetched } = await fetchData();
  const items = dayItems(data);
  const t = todayIso();

  const w = new ListWidget();
  w.backgroundColor = new Color("#f7f2e4");
  w.url = "https://anniieemo.github.io/master-board/";
  w.useDefaultPadding();
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const head = w.addText("▛▞ TODAY / 全天");
  head.font = Font.boldSystemFont(11);
  head.textColor = new Color("#33312a");
  w.addSpacer(4);

  const cap = config.widgetFamily === "small" ? 3 : config.widgetFamily === "large" ? 9 : 6;
  if (items.length > 0) {
    items.slice(0, cap).forEach(it => addRow(w, it));
    if (items.length > cap) {
      const more = w.addText("… 还有 " + (items.length - cap) + " 条，点开查看");
      more.font = Font.systemFont(9);
      more.textColor = new Color("#8f8871");
    }
  } else {
    const empty = w.addText("· 今天没有安排 ·");
    empty.font = Font.systemFont(12);
    empty.textColor = new Color("#8f8871");
    const nu = nextUp(data);
    if (nu) {
      w.addSpacer(2);
      const cap2 = w.addText("▸ 接下来");
      cap2.font = Font.systemFont(9);
      cap2.textColor = new Color("#8f8871");
      addRow(w, { time: nu.date.slice(5) + " " + (nu.start || ""), end: "", title: nu.title, fixed: false, done: false, past: false, now: false });
    }
  }

  w.addSpacer();

  if (config.widgetFamily !== "small") {
    const ddl = ddlLine(data);
    if (ddl) {
      const days = Math.ceil((new Date(ddl.ddl) - new Date()) / 864e5);
      const d = w.addText("⏳ DDL：" + ddl.title + "（" + (days >= 0 ? "剩" + days + "天" : "已逾期") + "）");
      d.font = Font.systemFont(9);
      d.textColor = new Color("#c24334");
      d.lineLimit = 1;
    }
  }

  const now = new Date();
  const foot = w.addText((fetched ? "更新 " + pad(now.getHours()) + ":" + pad(now.getMinutes()) : "网络未连上") + " · MASTER·BOARD");
  foot.font = Font.systemFont(8);
  foot.textColor = new Color("#8f8871");

  return w;
}

const widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
