// MASTER·BOARD iPhone 小组件 — Scriptable
// 安装：App Store 下载 Scriptable → 新建脚本 → 粘贴本文件 → 运行
// 然后长按桌面 → 添加小组件 → Scriptable → 选择本脚本
// 支持小/中/大尺寸；iOS 系统约每 5-15 分钟自动刷新

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
    return await req.loadJSON();
  } catch (e) {
    return { events: [], fixed: [] };
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

async function createWidget() {
  const data = await fetchData();
  const { fixed, evs, seg } = rowsFor(data);
  const w = new ListWidget();
  w.backgroundColor = new Color("#f7f2e4");
  w.url = "https://anniieemo.github.io/master-board/";
  w.useDefaultPadding();

  const head = w.addText("▛▞ TODAY·" + (seg === "上午" ? "AM" : seg === "下午" ? "PM" : "NIGHT"));
  head.font = Font.boldSystemFont(11);
  head.textColor = new Color("#33312a");
  w.addSpacer(4);

  const all = [...fixed.map(f => ({ time: f.start + "-" + f.end, title: f.title, color: CatColor.course, fixed: true })),
               ...evs.map(e => ({ time: (e.start || "--:--") + (e.end ? "-" + e.end : ""), title: (e.status === "done" ? "✓ " : "") + e.title, color: CatColor[e.category] || CatColor.life, fixed: false }))];
  if (all.length === 0) {
    const empty = w.addText("· 本时段空闲 ·");
    empty.font = Font.systemFont(12);
    empty.textColor = new Color("#8f8871");
  }
  all.slice(0, 6).forEach(r => {
    const line = w.addText(r.time + "  " + r.title);
    line.font = r.fixed ? Font.systemFont(11) : Font.semiboldSystemFont(11);
    line.textColor = r.fixed ? new Color("#8f8871") : new Color("#33312a");
    line.lineLimit = 1;
  });

  w.addSpacer();
  const foot = w.addText("MASTER·BOARD / " + seg + "时段");
  foot.font = Font.systemFont(8);
  foot.textColor = new Color("#8f8871");

  // 中尺寸以上：显示最近 DDL
  if (config.widgetFamily !== "small") {
    const ddl = (data.events || [])
      .filter(e => e.ddl && e.status !== "done")
      .sort((a, b) => (a.ddl < b.ddl ? -1 : 1))[0];
    if (ddl) {
      w.addSpacer(4);
      const days = Math.ceil((new Date(ddl.ddl) - new Date()) / 864e5);
      const d = w.addText("⏳ 最近DDL：" + ddl.title + "（" + (days >= 0 ? "剩" + days + "天" : "已逾期") + "）");
      d.font = Font.systemFont(9);
      d.textColor = new Color("#c24334");
      d.lineLimit = 1;
    }
  }
  return w;
}

const widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
