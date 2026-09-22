// MASTER·BOARD iPhone 三合一脚本 — Scriptable
// 桌面小组件：全天日程显示，点按直达工作台网页
// 在 Scriptable 里运行本脚本：可打卡完成今天的任务、快速加任务（多行、支持 HH:MM 前缀）
// 同步通道：GitHub API（与网页版同一份 schedule.json）
//
// ⚠️ 首次使用：把下面 GITHUB_PAT 换成你的 Fine-grained Token（仅本机保存）

const GITHUB_PAT = "";
const REPO = "AnniieeMo/master-board";
const WEB_URL = "https://anniieemo.github.io/master-board/";
const DATA_PATH = "data/schedule.json";

const pad = n => (n < 10 ? "0" + n : "" + n);
const todayIso = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
const mins = v => { const p = String(v || "00:00").split(":").map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };

async function apiFetch(path, options) {
  const req = new Request("https://api.github.com/repos/" + REPO + path, options);
  req.headers = Object.assign({}, options && options.headers);
  if (GITHUB_PAT) req.headers["Authorization"] = "Bearer " + GITHUB_PAT;
  req.headers["Accept"] = "application/vnd.github+json";
  return await req.loadJSON();
}

async function fetchData() {
  try {
    const req = new Request(WEB_URL.replace("master-board/", "master-board/") + "data/schedule.json");
    const data = await req.loadJSON();
    return data;
  } catch (e) {
    return null;
  }
}

async function commitSchedule(state) {
  if (!GITHUB_PAT) {
    const a = new Alert();
    a.title = "未配置 PAT";
    a.message = "把你的 GitHub Fine-grained Token 粘贴到脚本开头的 GITHUB_PAT 引号里，才能从手机同步。改动已暂存在本机本次运行中。";
    a.addAction("知道了");
    await a.present();
    return false;
  }
  try {
    const head = await apiFetch("/contents/" + DATA_PATH);
    const body = new Request("https://api.github.com/repos/" + REPO + "/contents/" + DATA_PATH, {
      method: "PUT",
      headers: { "Authorization": "Bearer " + GITHUB_PAT, "Accept": "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "iphone: update schedule " + new Date().toISOString().slice(0, 16),
        content: Data.fromString(JSON.stringify(state, null, 2) + "\n").toBase64String(),
        sha: head.sha
      })
    });
    const result = await body.loadJSON();
    return !!result.commit;
  } catch (e) {
    return false;
  }
}

function dayItems(state) {
  const t = todayIso();
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const fixed = (state.fixed || []).filter(f => f.date === t);
  const events = (state.events || []).filter(e => e.date === t);
  const items = [
    ...fixed.map(f => ({ id: "fixed", time: f.start, end: f.end, title: f.title, fixed: true, done: false })),
    ...events.map(e => ({ id: e.id, time: e.start || "00:00", end: e.end || "", title: e.title, fixed: false, done: e.status === "done" }))
  ].sort((a, b) => mins(a.time) - mins(b.time));
  return items.map(it => {
    const m = mins(it.time), e2 = mins(it.end || "23:59");
    return { ...it, past: e2 <= nowM || it.done, now: !it.done && m <= nowM && nowM < e2 };
  });
}

// ---------- 桌面小组件 ----------
function nextUp(state) {
  const t = todayIso();
  const list = (state.events || [])
    .filter(e => e.status !== "done" && e.date >= t)
    .sort((a, b) => (a.date + (a.start || "00:00")) < (b.date + (b.start || "00:00")) ? -1 : 1);
  return list[0] || null;
}
function ddlLine(state) {
  const list = (state.events || []).filter(e => e.ddl && e.status !== "done").sort((a, b) => (a.ddl < b.ddl ? -1 : 1));
  return list[0] || null;
}
function addRow(w, time, end, title, style) {
  const passed = style.passed;
  const prefix = style.done || passed ? "✓ " : style.now ? "▶ " : "";
  const line = w.addText(time + "-" + (end || "----") + "  " + prefix + title);
  line.font = style.fixed ? Font.systemFont(11) : Font.semiboldSystemFont(11);
  line.textColor = style.past ? new Color("#8f8871") : style.now ? new Color("#b9791f") : new Color("#33312a");
  line.lineLimit = 1;
}

async function widgetMode(state) {
  const items = dayItems(state);
  const w = new ListWidget();
  w.backgroundColor = new Color("#f7f2e4");
  // 点击行为不在脚本里写死：长按小组件 → 编辑 → 「When Tapped」自选
  // 想点开打卡菜单：选 Run Script（本脚本）；想进网页：选 Open URL 填 WEB_URL
  w.useDefaultPadding();
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const head = w.addText("▛▞ TODAY / 全天");
  head.font = Font.boldSystemFont(11);
  head.textColor = new Color("#33312a");
  w.addSpacer(4);

  const cap = config.widgetFamily === "small" ? 3 : config.widgetFamily === "large" ? 9 : 6;
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  if (items.length > 0) {
    items.slice(0, cap).forEach(it => {
      const passed = it.done || (it.fixed && it.past);
      addRow(w, it.time, it.end, (it.done || passed ? "✓ " : it.now ? "▶ " : "") + it.title,
        { fixed: it.fixed, past: it.past, now: it.now, done: it.done });
    });
    if (items.length > cap) {
      const more = w.addText("… 还有 " + (items.length - cap) + " 条，点开查看");
      more.font = Font.systemFont(9);
      more.textColor = new Color("#8f8871");
    }
  } else {
    const empty = w.addText("· 今天没有安排 ·");
    empty.font = Font.systemFont(12);
    empty.textColor = new Color("#8f8871");
    const nu = nextUp(state);
    if (nu) {
      w.addSpacer(2);
      const cap2 = w.addText("▸ 接下来");
      cap2.font = Font.systemFont(9);
      cap2.textColor = new Color("#8f8871");
      addRow(w, nu.date.slice(5) + " " + (nu.start || ""), "", nu.title, { fixed: false, past: false, now: false, done: false });
    }
  }

  w.addSpacer();

  if (config.widgetFamily !== "small") {
    const ddl = ddlLine(state);
    if (ddl) {
      const days = Math.ceil((new Date(ddl.ddl) - new Date()) / 864e5);
      const d = w.addText("⏳ DDL：" + ddl.title + "（" + (days >= 0 ? "剩" + days + "天" : "已逾期") + "）");
      d.font = Font.systemFont(9);
      d.textColor = new Color("#c24334");
      d.lineLimit = 1;
    }
  }

  const now2 = new Date();
  const foot = w.addText("更新 " + pad(now2.getHours()) + ":" + pad(now2.getMinutes()) + " · MASTER·BOARD");
  foot.font = Font.systemFont(8);
  foot.textColor = new Color("#8f8871");
  return w;
}

// ---------- 交互：打卡完成 ----------
async function interactiveCheck(state) {
  const open = state.events.filter(e => e.date === todayIso() && e.status !== "done");
  if (open.length === 0) {
    const a = new Alert();
    a.title = "今天没有可打卡的任务";
    a.message = "全部完成，或今天的任务还没排。";
    a.addAction("好的");
    await a.presentAlert();
    return;
  }
  const doneIds = [];
  let remaining = open.slice();
  let going = true;
  while (going) {
    const a = new Alert();
    a.title = "✔ 点要完成的任务";
    a.message = "已选 " + doneIds.length + " / " + open.length + " 项";
    remaining.forEach(e => a.addAction("○ " + e.title));
    a.addAction(doneIds.length ? "✅ 完成并同步" : "取消");
    const idx = await a.presentAlert();
    const cancelIdx = remaining.length;
    if (idx >= cancelIdx) {
      going = false;
    } else {
      doneIds.push(remaining[idx].id);
      remaining.splice(idx, 1);
    }
  }
  if (doneIds.length === 0) return;
  doneIds.forEach(id => {
    const e = state.events.find(x => x.id === id);
    if (e) e.status = "done";
  });
  const ok = await commitSchedule(state);
  const a = new Alert();
  a.title = ok ? "✅ 已同步到 GitHub" : "⚠ 已在本机标记，同步失败";
  a.message = ok ? "全端约 1 分钟内同步，桌面小组件下次刷新生效。" : "请检查网络 / PAT 配置。";
  a.addAction("好的");
  await a.presentAlert();
}

// ---------- 交互：快速加任务 ----------
async function interactiveAdd(state) {
  const a = new Alert();
  a.title = "📝 请输入任务";
  a.message = "每行一条；行首可加时间，如「20:00 写作业」";
  a.addTextField("", "发笔记：解锁使用 iPhone 新姿势\n睡前喝宝矿力");
  a.addAction("完成");
  a.addCancelAction("取消");
  const idx = await a.presentAlert();
  const raw = a.textFieldFieldValue;
  if (idx !== 0) return;
  const t = todayIso();
  const lines = raw.split("\n").map(s => s.trim()).filter(s => s);
  if (lines.length === 0) return;
  lines.forEach(line => {
    const m = line.match(/^(?:([01]?\d|2[0-3]):([0-5]\d))\s+(.+)$/);
    const ev = {
      id: "e-" + Date.now().toString(36) + Math.floor(Math.random() * 999),
      title: m ? m[3] : line, category: "life",
      date: t, start: m ? m[1] + ":" + m[2] : "", end: "",
      ddl: "", status: "todo", notes: "", source: "iphone"
    };
    if (ev.start) ev.end = pad(Math.min(23, +ev.start.slice(0, 2) + 1)) + ev.start.slice(2);
    state.events.push(ev);
  });
  const ok = await commitSchedule(state);
  const b = new Alert();
  b.title = ok ? "✅ 已加 " + lines.length + " 条并同步" : "⚠ 已在本机加入，同步失败";
  b.message = ok ? "手机/电脑网页和桌面小组件稍后自动更新。" : "请检查网络 / PAT 配置。";
  b.addAction("好的");
  await b.presentAlert();
}

// ---------- 入口 ----------
if (config.runsInWidget) {
  let state = await fetchData();
  if (!state) state = { events: [], fixed: [], summaries: [], ideas: [] };
  state.events = state.events || [];
  const w = await widgetMode(state);
  Script.setWidget(w);
} else {
  const data = await fetchData();
  if (!data) {
    const a = new Alert();
    a.title = "网络不可用";
    a.addAction("好的");
    await a.presentAlert();
    Script.complete();
  }
  const state = data;
  state.events = state.events || [];
  const menu = new Alert();
  menu.title = "▛▞ MASTER·BOARD";
  menu.message = "今天 " + state.events.filter(e => e.date === todayIso()).length + " 项安排";
  menu.addAction("✔ 打卡完成任务");
  menu.addAction("＋ 快速加任务");
  menu.addAction("🌐 打开工作台网页");
  menu.addCancelAction("取消");
  const choice = await menu.presentAlert();
  if (choice === 0) await interactiveCheck(state);
  else if (choice === 1) await interactiveAdd(state);
  else if (choice === 2) Safari.openInApp(WEB_URL);
}
Script.complete();
