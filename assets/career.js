(() => {
  "use strict";
  const root = document.getElementById("view-career");
  if (!root) return;
  const LS = "mb.career.progress.v1";
  const STATUS = { todo: "未开始", doing: "推进中", blocked: "有阻碍", done: "已验收" };
  let plan, allowed, progress = { version: 1, fields: {} };
  let page = "roadmap", selected = "2026-10", syncBusy = false, localSaved = true;
  let syncText = "进度实时保存在本机；跨设备使用「同步进度」。";
  let messageTimer;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const localMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date()).replace("/", "-");
  function normalize(input) {
    if (!input || input.version !== 1 || !input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) return { version: 1, fields: {} };
    const out = { version: 1, fields: {} };
    for (const [key, field] of Object.entries(input.fields)) {
      if (!allowed.has(key) || !field || typeof field.value !== "string" || !Number.isFinite(field.at) || field.at <= 0) continue;
      if (key.endsWith("/status") && !Object.hasOwn(STATUS, field.value)) continue;
      out.fields[key] = { value: field.value.slice(0, 4000), at: field.at };
    }
    return out;
  }
  function merge(a, b) {
    const out = { version: 1, fields: { ...normalize(a).fields } };
    for (const [key, f] of Object.entries(normalize(b).fields)) {
      const old = out.fields[key];
      if (!old || f.at > old.at || (f.at === old.at && f.value > old.value)) out.fields[key] = f;
    }
    return out;
  }
  function readLocal() { try { return normalize(JSON.parse(localStorage.getItem(LS) || "null")); } catch { return { version: 1, fields: {} }; } }
  function saveLocal() {
    try { localStorage.setItem(LS, JSON.stringify(progress)); localSaved = true; }
    catch { localSaved = false; tell("浏览器未允许保存，当前改动仅在此页；请先导出备份。"); }
    updateSaveLabel();
  }
  function updateSaveLabel() {
    const el = root.querySelector("[data-save-label]");
    if (el) el.textContent = localSaved ? syncText : "本机保存不可用，请导出备份。";
  }
  const value = (key, fallback = "") => progress.fields[key]?.value ?? fallback;
  function setValue(key, val) {
    if (!allowed.has(key)) return;
    if (key.endsWith("/status") && !Object.hasOwn(STATUS, val)) return;
    progress.fields[key] = { value: String(val).slice(0, 4000), at: Date.now() };
    syncText = "已保存本机；有新改动，可同步到其他设备。";
    saveLocal();
  }
  const count = month => month.deliverables.filter(d => value(`${month.id}/${d.id}/status`, "todo") === "done").length;
  const percent = month => Math.round(count(month) / month.deliverables.length * 100);
  function tell(text) {
    document.querySelector(".job-message")?.remove(); clearTimeout(messageTimer);
    const box = document.createElement("div"); box.className = "job-message"; box.setAttribute("role", "status"); box.textContent = text;
    document.body.appendChild(box); messageTimer = setTimeout(() => box.remove(), 6000);
  }
  function stats() {
    const month = plan.months.find(m => m.id === selected);
    const total = plan.months.reduce((n, m) => n + m.deliverables.length, 0);
    const done = plan.months.reduce((n, m) => n + count(m), 0);
    const complete = plan.months.filter(m => percent(m) === 100).length;
    return `<div class="job-strip"><div class="job-stat"><small>当前查看 · ${esc(month.year)} 年</small><strong>${esc(month.label)} / ${esc(month.title.split(" · ")[0])}</strong><small>验收日期 ${esc(month.deadline)}</small></div><div class="job-stat"><small>本月交付验收</small><strong>${count(month)} / ${month.deliverables.length} 项 · ${percent(month)}%</strong><div class="job-meter" role="progressbar" aria-label="${esc(month.label)}交付完成度" aria-valuenow="${percent(month)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percent(month)}%"></span></div></div><div class="job-stat"><small>全年证据积累（不是时间进度）</small><strong>${done} / ${total} 项</strong><small>${complete} / 11 个月全部验收</small></div></div>`;
  }
  function roadmap() {
    return `<div class="job-route">${plan.phases.map(p => `<div class="job-phase"><b>${esc(p.label)}</b><span>${esc(p.months)}</span><p>${esc(p.goal)}</p></div>`).join("")}</div>
      <div class="job-section-head"><h2>完整规划大表</h2><p>上班与下班并行；点月份进入交付、证据与阻碍记录。</p></div>
      <div class="job-table-wrap"><table class="job-table"><thead><tr><th class="job-month-cell">时间</th><th>核心矛盾 → 阶段目标</th><th>上班 · 真实业务与项目</th><th>下班 · 通用能力与市场</th><th>交付与验收 → 能力</th></tr></thead><tbody>${plan.months.map(m => `<tr class="${m.id === localMonth() ? "job-now" : ""}"><td><button class="month-link" data-job-month="${m.id}" aria-label="查看${m.year}年${m.label}交付">${esc(m.label)}</button><small>${m.year} · ${esc(m.deadline.slice(5))}</small><div class="job-row-progress">${count(m)}/${m.deliverables.length} 已验收</div></td><td data-label="核心矛盾 → 目标"><b>${esc(m.title)}</b><p>${esc(m.tension)}</p><small>目标：${esc(m.goal)}</small></td><td data-label="上班做什么">${esc(m.inside)}</td><td data-label="下班做什么">${esc(m.outside)}</td><td data-label="交付、验收与能力"><ul>${m.deliverables.map(d => `<li>${esc(d.title)}</li>`).join("")}</ul><small>验收：${esc(m.accept)}</small><small>能力：${esc(m.capability)}</small></td></tr>`).join("")}</tbody></table></div>
      <div class="job-guide">项目管理贯穿每月真实交付；英语从 11 月重点训练，随后进入 demo、岗位体验和面试；行业与财会知识进入方案与 ROI。小目标只在服务当月交付时展开。</div>
      <div class="job-section-head"><h2>带走一张图</h2><p>长图是初始规划快照；实时进度以「本月交付」为准。</p></div>
      <div class="job-downloads"><a href="Career%20Roadmap.html" target="_blank" rel="noopener">打开规划流程图</a><a href="assets/career-flow.png" download="Career Roadmap.png">保存流程图 PNG</a><a href="assets/career-overview.png" download="Career Overview.png">保存完整规划大表</a></div>`;
  }
  function monthly() {
    const m = plan.months.find(x => x.id === selected);
    return `<div class="job-section-head"><h2>本月只围绕一个主题推进</h2><label><span class="job-eyebrow">切换月份 </span><select class="job-month-select" aria-label="切换月份" data-job-month-select>${plan.months.map(x => `<option value="${x.id}" ${x.id === selected ? "selected" : ""}>${x.year} 年 ${x.label}</option>`).join("")}</select></label></div>
      <div class="job-current"><div class="job-box"><div class="job-eyebrow">${esc(m.deadline)} / MONTHLY OUTCOME</div><h3 style="font-size:23px;margin-top:8px">${esc(m.title)}</h3><p>${esc(m.goal)}</p><p class="muted">核心矛盾：${esc(m.tension)}</p><div class="job-accept"><b>什么程度才算完成</b>${esc(m.accept)}</div><p class="muted">预计形成：${esc(m.capability)}</p></div><div class="job-box"><h3>两条实施线</h3><p><b>上班</b><br>${esc(m.inside)}</p><p><b>下班</b><br>${esc(m.outside)}</p></div></div>
      <div class="job-current"><div class="job-box"><h3>交付检查 · 完成需要证据</h3><p class="job-note">「已验收」按真实完成情况选择；数量只反映交付进展，不代表能力自动达标。</p>${m.deliverables.map(d => {
        const key = `${m.id}/${d.id}`, status = value(key + "/status", "todo");
        return `<div class="job-deliver"><div><span class="job-track">${esc(d.track)}</span><h3>${esc(d.title)}</h3><p>${esc(d.proof)}</p><button class="job-btn job-schedule" data-job-schedule="${d.id}">把下一步放入今日排期</button></div><div><label class="job-label" for="status-${d.id}">交付状态</label><select class="job-status" id="status-${d.id}" aria-label="${esc(d.title)}状态" data-job-field="${key}/status" data-status="${status}">${Object.entries(STATUS).map(([v, name]) => `<option value="${v}" ${v === status ? "selected" : ""}>${name}</option>`).join("")}</select></div><div class="job-evidence"><label class="job-label" for="evidence-${d.id}">证据／反馈／文件位置</label><input class="job-input" id="evidence-${d.id}" maxlength="4000" data-job-field="${key}/evidence" value="${esc(value(key + "/evidence"))}" placeholder="例：方案链接、演示位置、对方原话或验证结果"></div></div>`;
      }).join("")}</div><div class="job-box"><h3>本周唯一下一步</h3><p class="muted">${esc(m.next)}</p><label class="job-label" for="job-next">写一个 30–90 分钟能推进的动作</label><textarea class="job-input" id="job-next" maxlength="4000" data-job-field="${m.id}/next" placeholder="动作＋预期交付＋截止时间">${esc(value(m.id + "/next"))}</textarea><label class="job-label" for="job-note">阻碍、需要的帮助与本月复盘</label><textarea class="job-input" id="job-note" maxlength="4000" style="min-height:160px" data-job-field="${m.id}/note" placeholder="哪里卡住？找谁确认？要缩范围还是换方法？">${esc(value(m.id + "/note"))}</textarea><p class="job-note">先做一个版本；卡住一个工作日就带初稿求助。未完成不加倍，下周重新安排。</p><button class="job-btn" data-job-action="export">导出进度备份</button></div></div>`;
  }
  function details(title, content, open = false) { return `<details class="job-details" ${open ? "open" : ""}><summary>${esc(title)}</summary><div class="job-detail-body">${content}</div></details>`; }
  function guide() {
    const biz = plan.business, tech = plan.technical;
    return `<div class="job-section-head"><h2>能力说明 · 只为月度交付服务</h2><p>10 月商业地图、11 月英语与岗位、12 月技术细节均可随时回看。</p></div>
      ${details("10 月｜TP 商业链路做到什么程度", `<p>${esc(biz.scope)}</p><ol>${biz.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol><p><b>五个核实问题</b></p><ol>${biz.questions.map(s => `<li>${esc(s)}</li>`).join("")}</ol><p>${esc(biz.fact)} <a href="${biz.source}" target="_blank" rel="noopener">年报依据</a></p><p>产出统一用「公开依据／内部确认／未知」标记，避免把推测当事实。</p>`)}
      ${details("10—11 月｜候选岗位与实际工作结构", plan.roles.map(r => `<div class="job-term"><h4>${esc(r.name)}</h4><p>${esc(r.aliases)}</p><p><b>负责阶段：</b>${esc(r.stage)}</p><p><b>主要产出：</b>${esc(r.output)}</p><p><b>调研要问：</b>${esc(r.verify)}</p><p>${esc(r.hypothesis)}</p></div>`).join("") + `<p>11 月 JD 表记录：公司／城市与届次、职责与交付、技术门槛、工作安排、固定薪资与奖金口径。3 月以实际体验确定主攻和备选；不从 title 推断远程、出差或薪资。</p>`)}
      ${details("11 月｜售前英语：听、读、写、说连成一个交付", `<p>已有英文 readout / demo 是起点。训练目标是让表达更准确地连接客户问题、业务价值、证据与下一步。</p><ol><li>每周选一段 5–8 分钟行业 demo 或一份已有客户材料，提炼客户、问题、价值和限制。</li><li>先写 120 词左右英文摘要，再改成一页客户方案；避免只堆功能和形容词。</li><li>录 3 分钟 pitch，练 5 分钟需求澄清和异议问答；同一内容重录两次即可。</li><li>请售前 +1 或同行只点评三个最影响理解的问题，月底对比第一版与重录版。</li></ol><p>验收看五项：问题是否准确、结构是否清楚、价值是否有证据、应答是否自然、是否明确推进下一步。后续直接进入 1 月英文 demo 与 6 月面试。</p>`)}
      ${details("12 月｜Agent / Workflow 的完整架构", `<p>${esc(tech.goal)}</p><div class="job-flow">${tech.flow.map(f => `<div class="job-flow-step"><h3>${esc(f.name)}</h3><p>${esc(f.action)}</p><p><b>输出：</b>${esc(f.output)}</p><p><b>检查：</b>${esc(f.failure)}</p></div>`).join("")}</div><p>检索、长期记忆和动态 Agent 并非每个系统都必需。先理解业务与组件的因果关系，再决定需要哪些；不要为了展示术语堆组件。</p><p><a href="${tech.source}" target="_blank" rel="noopener">架构与 Workflow / Agent 的工程参考</a></p>`, true)}
      ${tech.groups.map(g => details(`12 月概念卡｜${g.name}（${g.terms.length} 项）`, `<div class="job-terms">${g.terms.map(t => `<div class="job-term"><h4>${esc(t.name)}</h4><p><b>是什么：</b>${esc(t.meaning)}</p><p><b>在你的场景里：</b>${esc(t.use)}</p><p><b>如何验证／排查：</b>${esc(t.test)}</p></div>`).join("")}</div>`)).join("")}
      ${details("贯穿全年｜小目标怎样服务大目标", `<table class="job-table mini"><thead><tr><th>练习</th><th>进入哪条交付链</th></tr></thead><tbody>${plan.rhythm.integrations.map(i => `<tr><td>${esc(i.small)}</td><td>${esc(i.parent)}</td></tr>`).join("")}</tbody></table><p>${esc(plan.rhythm.weekly)}</p><p><b>周复盘只回答：</b>${plan.rhythm.review.map(esc).join("；")}</p><ul>${plan.rhythm.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul>`)}
      ${details("整合依据｜咨询共识与个人优势", `<p>${plan.trajectory.map(esc).join(" → ")}</p>${plan.strengths.map(s => `<div class="job-term"><h4>${esc(s.name)}</h4><p>${esc(s.evidence)}</p><p><b>进入规划：</b>${esc(s.use)}</p></div>`).join("")}<ul>${plan.sources.map(s => `<li><b>${esc(s.title)}：</b>${esc(s.note)}</li>`).join("")}</ul><p>这些是待现实验证的职业假设，不使用性格标签或优势匹配分数替代岗位体验。</p>`)} `;
  }
  function render() {
    if (!plan) return;
    root.innerHTML = `<section class="job"><div class="job-head"><div><div class="job-eyebrow">JOB HUNTING / 2026.10 — 2027.08</div><h1>每个月，留下下一份工作的证据。</h1><p class="job-sub">上班做真实交付 · 下班建可迁移能力 · 在市场里验证方向</p></div><div class="job-target"><strong>18–20k</strong><span>税前固定月薪目标<br>2028 届 · 广州／深圳／远程</span></div></div><div class="job-north"><b>北极星</b>${esc(plan.northStar)}<details><summary>犹豫或卡住时，再看一句话</summary><p>${esc(plan.restart)}</p><p>${esc(plan.yearGoal)}</p></details></div>
      <div class="job-controls"><button class="job-btn ${page === "roadmap" ? "active" : ""}" data-job-page="roadmap">全年主线与大表</button><button class="job-btn ${page === "month" ? "active" : ""}" data-job-page="month">本月交付</button><button class="job-btn ${page === "guide" ? "active" : ""}" data-job-page="guide">能力说明</button><span class="job-spacer"></span><button class="job-btn" data-job-action="sync" ${syncBusy ? "disabled" : ""}>${syncBusy ? "同步中…" : "同步进度"}</button><button class="job-btn" data-job-action="export">备份</button><button class="job-btn" data-job-action="import">导入</button><input type="file" accept="application/json,.json" data-job-import hidden><span class="job-sync"><i class="job-live"></i><span data-save-label>${esc(localSaved ? syncText : "本机保存不可用，请导出备份。")}</span></span></div>
      ${stats()}<div data-job-content>${page === "roadmap" ? roadmap() : page === "month" ? monthly() : guide()}</div><div class="job-source">计划更新：${esc(plan.updated)} · 手动更新状态后即重算进度；默认保存本机，GitHub 同步沿用原平台设置、由你点击触发。<strong> 同步的进度／备注会写入当前 GitHub 仓库；仓库公开时，备注也会公开，请勿填写敏感信息。</strong>与现有日程独立保存。</div></section>`;
  }
  function download(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  function ghConfig() { try { const c = JSON.parse(localStorage.getItem("mb.config") || "{}"); return c.gh || {}; } catch { return {}; } }
  function encode(text) { return btoa(Array.from(new TextEncoder().encode(text), n => String.fromCharCode(n)).join("")); }
  function decode(text) { return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, "")), c => c.charCodeAt(0))); }
  async function sync() {
    if (syncBusy) return;
    const cfg = ghConfig();
    if (!cfg.pat || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cfg.repo || "")) {
      tell("进度已保存在本机。跨设备同步请在原平台「设置」填写 GitHub 仓库与写回权限。"); return;
    }
    syncBusy = true; render();
    try {
      const url = `https://api.github.com/repos/${cfg.repo}/contents/data/career-progress.json`;
      const headers = { Authorization: `Bearer ${cfg.pat}`, Accept: "application/vnd.github+json" };
      let success = false;
      for (let attempt = 0; attempt < 3 && !success; attempt++) {
        const response = await fetch(url + "?t=" + Date.now(), { headers, cache: "no-store" });
        if (!response.ok && response.status !== 404) throw new Error(`读取失败（${response.status}）`);
        let remote = { version: 1, fields: {} }, sha;
        if (response.ok) { const data = await response.json(); sha = data.sha; remote = JSON.parse(decode(data.content || "")); }
        progress = merge(remote, progress); saveLocal();
        const submitted = JSON.stringify(progress, null, 2) + "\n";
        const body = { message: "app: career progress update", content: encode(submitted), ...(sha ? { sha } : {}) };
        const put = await fetch(url, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (put.ok) {
          success = true;
          syncText = JSON.stringify(progress, null, 2) + "\n" === submitted
            ? "已同步 GitHub；另一设备打开本页或点同步即可合并。"
            : "已同步提交的版本；同步期间的新改动已留在本机，请再点一次同步。";
        } else if (put.status !== 409 && put.status !== 422) throw new Error(`写回失败（${put.status}）`);
      }
      if (!success) throw new Error("其他设备正在更新，请稍后再同步");
      tell("求职进度已同步；现有日程未改动。");
    } catch (error) {
      syncText = "同步未成功，本机进度仍保留；可导出备份。";
      tell(`${error.message || "网络连接失败"}。本机记录仍在，可稍后重试。`);
    } finally { syncBusy = false; render(); }
  }
  root.addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.jobPage) { page = button.dataset.jobPage; render(); return; }
    if (button.dataset.jobMonth) { selected = button.dataset.jobMonth; page = "month"; render(); root.scrollIntoView({ block: "start" }); return; }
    if (button.dataset.jobSchedule) {
      const m = plan.months.find(x => x.id === selected), d = m.deliverables.find(x => x.id === button.dataset.jobSchedule);
      if (d) window.dispatchEvent(new CustomEvent("master-board-career-schedule", { detail: { title: `${m.label} ${value(m.id + "/next") || d.title}`, deadline: m.deadline } }));
      return;
    }
    switch (button.dataset.jobAction) {
      case "sync": void sync(); break;
      case "export": download(new Blob([JSON.stringify({ ...progress, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" }), "Career Progress.json"); tell("已导出进度备份（不包含平台密钥）。"); break;
      case "import": root.querySelector("[data-job-import]").click(); break;
    }
  });
  root.addEventListener("input", event => {
    const el = event.target;
    if (el.dataset.jobField && el.tagName !== "SELECT") setValue(el.dataset.jobField, el.value);
  });
  root.addEventListener("change", async event => {
    const el = event.target;
    if (el.hasAttribute("data-job-month-select")) { selected = el.value; render(); return; }
    if (el.dataset.jobField && el.tagName === "SELECT") { setValue(el.dataset.jobField, el.value); render(); return; }
    if (el.hasAttribute("data-job-import")) {
      const file = el.files?.[0]; if (!file) return;
      try {
        if (file.size > 1024 * 1024) throw new Error("文件超过 1 MB");
        const input = JSON.parse(await file.text());
        if (input.version !== 1 || !input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) throw new Error("不是有效的求职进度文件");
        progress = merge(progress, input); saveLocal(); render(); tell("已按每个字段的更新时间合并；原有记录保留。");
      } catch (error) { tell(`导入失败：${error.message}。现有记录未修改。`); }
    }
  });
  window.addEventListener("storage", event => { if (event.key === LS && plan) { progress = merge(progress, readLocal()); render(); } });
  function openFromHash() {
    if (location.hash === "#career") document.querySelector('.tab[data-view="career"]')?.click();
  }
  window.addEventListener("hashchange", openFromHash);
  async function boot() {
    try {
      const response = await fetch("data/career-plan.json?v=20261019");
      if (!response.ok) throw new Error(`规划读取失败（${response.status}）`);
      plan = await response.json();
      allowed = new Set();
      for (const m of plan.months) {
        allowed.add(`${m.id}/note`); allowed.add(`${m.id}/next`);
        for (const d of m.deliverables) { allowed.add(`${m.id}/${d.id}/status`); allowed.add(`${m.id}/${d.id}/evidence`); }
      }
      selected = plan.months.some(m => m.id === localMonth()) ? localMonth() : plan.months[0].id;
      progress = readLocal(); render(); openFromHash();
      try {
        const remote = await fetch("data/career-progress.json?t=" + Date.now(), { cache: "no-store" });
        if (remote.ok) { progress = merge(await remote.json(), progress); saveLocal(); render(); }
      } catch { /* Device-local records remain usable offline. */ }
    } catch (error) {
      root.innerHTML = `<div class="panel"><div class="pb">${esc(error.message)}。刷新重试，或先查看 <a href="Career%20Roadmap.html">规划流程图</a>。</div></div>`;
    }
  }
  void boot();
})();
