// MASTER·BOARD iPhone 小组件 — Scriptable
// 安装：App Store 下载 Scriptable → 新建脚本 → 粘贴本文件 → 运行
// 然后长按桌面 → 添加小组件 → Scriptable → 选择本脚本；点小组件直达工作台
// 注意：iOS 小组件刷新由系统调度（约 15 分钟或更久）；想立刻刷新就打开 Scriptable 跑一次本脚本

const URL_ = "https://anniieemo.github.io/master-board/data/schedule.json";

const pad = n => (n < 10 ? "0" + n : "" + n);
const todayIso = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
const segOf = s => {
  const h = +String(s || "").slice(0, 2);
  return h < 12 ? "上午" : h < 18 ? "下午" : "晚上";
};

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

function rowsFor(data) {
  const t = todayIso();
  const seg = segOf(new Date().getHours());
  const fixed = (data.fixed || []).filter(f => f.date === t && segOf(f.start) === seg);
  const evs = (data.events || [])
    .filter(e => e.date === t && segOf(e.start || "20:00") === seg)
    .sort((a, b) => ((a.start || "99") < (b.start || "99") ? -1 : 1));
  return { fixed, evs, seg };
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

function addRow(w, time, title, color, fixed) {
  const line = w.addText(time + "  " + title);
  line.font = fixed ? Font.systemFont(11) : Font.semiboldSystemFont(11);
  line.textColor = fixed ? new Color("#8f8871") : new Color("#33312a");
  line.lineLimit = 1;
}

async function createWidget() {
  const { data, fetched } = await fetchData();
  const { fixed, evs, seg } = rowsFor(data);
  const segEn = seg === "上午" ? "AM" : seg === "下午" ? "PM" : "NIGHT";

  const w = new ListWidget();
  w.backgroundColor = new Color("#f7f2e4");
  w.url = "https://anniieemo.github.io/master-board/";
  w.useDefaultPadding();
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const head = w.addText("▛▞ TODAY·" + segEn);
  head.font = Font.boldSystemFont(11);
  head.textColor = new Color("#33312a");
  w.addSpacer(4);

  const all = [
    ...fixed.map(f => ({ time: f.start + "-" + f.end, title: f.title, color: CatColor.course, fixed: true })),
    ...evs.map(e => ({ time: (e.start || "--:--") + (e.end ? "-" + e.end : ""), title: (e.status === "done" ? "✓ " : "") + e.title, color: CatColor[e.category] || CatColor.life, fixed: false }))
  ];
  if (all.length > 0) {
    all.slice(0, 5).forEach(r => addRow(w, r.time, r.title, r.color, r.fixed));
  } else {
    const nu = nextUp(data);
    if (nu) {
      const cap = w.addText("▸ 接下来");
      cap.font = Font.systemFont(9);
      cap.textColor = new Color("#8f8871");
      addRow(w, nu.date.slice(5) + " " + (nu.start || ""), nu.title, CatColor[nu.category] || CatColor.life, false);
    } else {
      const empty = w.addText("· 本时段空闲 ·");
      empty.font = Font.systemFont(12);
      empty.textColor = new Color("#8f8871");
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
