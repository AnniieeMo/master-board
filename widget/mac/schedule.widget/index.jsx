// MASTER·BOARD 桌面小组件 — Übersicht
// 安装：brew install --cask übersicht
// 然后把本文件夹复制/软链到 ~/Library/Application Support/Übersicht/widgets/

import { run } from "uebersicht";

export const refreshFrequency = 60000;

export const command = `curl -s "https://anniieemo.github.io/master-board/data/schedule.json"`;

const pad = n => (n < 10 ? "0" + n : "" + n);
const todayIso = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
const segOf = start => {
  const h = +String(start || "").slice(0, 2);
  return h < 12 ? "上午" : h < 18 ? "下午" : "晚上";
};
const nowSeg = () => {
  const h = new Date().getHours();
  return h < 12 ? "上午" : h < 18 ? "下午" : "晚上";
};

export const render = ({ output }) => {
  let data = {};
  try { data = JSON.parse(output); } catch (e) {}
  const events = (data.events || []).filter(e => e.date === todayIso());
  const fixed = (data.fixed || []).filter(f => f.date === todayIso());
  const seg = nowSeg();

  const segName = { 上午: "AM", 下午: "PM", 晚上: "NIGHT" }[seg];
  const list = events
    .filter(e => segOf(e.start) === seg)
    .sort((a, b) => (a.start || "99") < (b.start || "99") ? -1 : 1);
  const fixedList = fixed.filter(f => segOf(f.start) === seg);

  const catColor = c => ({ skill: "#2f7d3c", course: "#2f7a8f", work: "#b9791f", life: "#8f8871" }[c] || "#8f8871");

  const row = (time, title, color, dashed) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 5 }}>
      <span style={{ color: "#8f8871", fontSize: 11 }}>{time}</span>
      <span style={{
        color: "#33312a", fontSize: 12, fontFamily: '"Fusion Pixel 12px Monospaced SC", Menlo, monospace',
        borderBottom: dashed ? "1px dashed #b3aa90" : "2px solid " + color, paddingBottom: 1
      }}>{title}</span>
    </div>
  );

  return (
    <div
      onClick={() => run("open 'https://anniieemo.github.io/master-board/'")}
      style={{
      position: "fixed", top: 24, left: 28, width: 260,
      background: "rgba(247,242,228,.94)", border: "2px solid #33312a",
      boxShadow: "4px 4px 0 rgba(51,49,42,.25)", padding: "10px 12px",
      fontFamily: '"Fusion Pixel 12px Monospaced SC", Menlo, monospace', fontSize: 12,
      cursor: "pointer"
    }}>
      <div style={{ color: "#33312a", fontSize: 11, letterSpacing: 2, borderBottom: "2px solid #33312a", paddingBottom: 4, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <b style={{ fontWeight: "normal" }}>▛▞ TODAY·{segName}</b>
        <span style={{ color: "#8f8871" }}>{todayIso().slice(5)}</span>
      </div>
      {fixedList.map(f => row(f.start + "-" + f.end, f.title, "#2f7a8f", true))}
      {list.map(e => row((e.start || "--:--") + (e.end ? "-" + e.end : ""), (e.status === "done" ? "✓ " : "") + e.title, catColor(e.category), false))}
      {list.length === 0 && fixedList.length === 0 && (
        <div style={{ color: "#8f8871", fontSize: 11, padding: "6px 0" }}>· 本时段空闲 ·</div>
      )}
      <div style={{ color: "#8f8871", fontSize: 9, marginTop: 6, letterSpacing: 1 }}>MASTER·BOARD WIDGET / {seg}时段</div>
    </div>
  );
};
