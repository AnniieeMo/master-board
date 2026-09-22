// MASTER·BOARD 桌面小组件 — Übersicht（全天版）
// 安装：brew install --cask ubersicht
// 把本文件夹复制/软链到 ~/Library/Application Support/Übersicht/widgets/
// 点击小组件直达工作台；每 60 秒自动刷新

import { run } from "uebersicht";

export const refreshFrequency = 60000;

export const command = `curl -s "https://anniieemo.github.io/master-board/data/schedule.json"`;

const pad = n => (n < 10 ? "0" + n : "" + n);
const todayIso = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
const mins = v => { const p = String(v || "00:00").split(":").map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };

export const render = ({ output }) => {
  let data = {};
  try { data = JSON.parse(output); } catch (e) {}
  const t = todayIso();
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();

  const fixed = (data.fixed || []).filter(f => f.date === t);
  const events = (data.events || []).filter(e => e.date === t);

  const items = [
    ...fixed.map(f => ({ time: f.start, end: f.end, title: f.title, fixed: true, done: false })),
    ...events.map(e => ({ time: e.start || "00:00", end: e.end || "", title: e.title, fixed: false, done: e.status === "done", cat: e.category }))
  ].sort((a, b) => mins(a.time) - mins(b.time));

  const MAX = 9;
  const shown = items.slice(0, MAX);
  const hidden = items.length - shown.length;

  const catColor = c => ({ skill: "#2f7d3c", course: "#2f7a8f", work: "#b9791f", life: "#8f8871" }[c] || "#8f8871");

  const row = (it) => {
    const m = mins(it.time), e2 = mins(it.end || "23:59");
    const past = e2 <= nowM || it.done;
    const now = !it.done && m <= nowM && nowM < e2;
    const passed = it.done || (it.fixed && past);
    const mark = passed ? "✓ " : now ? "◀ NOW " : "";
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4, opacity: past ? 0.4 : 1 }}>
        <span style={{ color: "#8f8871", fontSize: 10, width: 78 }}>{it.time}-{it.end || "----"}</span>
        <span style={{
          color: it.fixed ? "#8f8871" : "#33312a", fontSize: 11,
          fontFamily: '"Fusion Pixel 12px Monospaced SC", Menlo, monospace',
          borderBottom: it.fixed ? "1px dashed #b3aa90" : "2px solid " + (it.done ? "#b3aa90" : catColor(it.cat)),
          paddingBottom: 1, textDecoration: passed ? "line-through" : "none"
        }}>{mark}{it.title}</span>
        {!passed && now && <span style={{ color: "#b9791f", fontSize: 9 }}>NOW</span>}
        {!passed && it.done && <span style={{ color: "#2f7d3c", fontSize: 9 }}>✓</span>}
      </div>
    );
  };

  return (
    <div
      onClick={() => run("open 'https://anniieemo.github.io/master-board/'")}
      style={{
      position: "fixed", top: 24, left: 28, width: 272,
      background: "rgba(247,242,228,.94)", border: "2px solid #33312a",
      boxShadow: "4px 4px 0 rgba(51,49,42,.25)", padding: "10px 12px",
      fontFamily: '"Fusion Pixel 12px Monospaced SC", Menlo, monospace', fontSize: 12,
      cursor: "pointer"
    }}>
      <div style={{ color: "#33312a", fontSize: 11, letterSpacing: 2, borderBottom: "2px solid #33312a", paddingBottom: 4, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <b style={{ fontWeight: "normal" }}>▛▞ TODAY / 全天</b>
        <span style={{ color: "#8f8871" }}>{t.slice(5)}</span>
      </div>
      {shown.map(it => row(it))}
      {items.length === 0 && <div style={{ color: "#8f8871", fontSize: 11, padding: "6px 0" }}>· 今天没有安排 ·</div>}
      {hidden > 0 && <div style={{ color: "#8f8871", fontSize: 9 }}>… 还有 {hidden} 条，点击查看</div>}
      <div style={{ color: "#8f8871", fontSize: 9, marginTop: 6, letterSpacing: 1, borderTop: "1px dotted #b3aa90", paddingTop: 4 }}>MASTER·BOARD WIDGET / 虚线=固定</div>
    </div>
  );
};
