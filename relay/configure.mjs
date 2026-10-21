// Temporary loopback-only secret entry. Values stay in memory / Wrangler stdin.
import http from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const relayUrl = process.argv[2];
if (!relayUrl || !/^https:\/\/[a-z0-9.-]+\.(workers|pages)\.dev$/.test(relayUrl)) throw new Error("Pass the deployed Cloudflare origin only");
const nonce = randomBytes(24).toString("hex"), route = "/setup/" + nonce;
let busy = false, complete = false, session = null, closed = false;
const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>万事屋 · 安全配置中转</title><style>body{background:#e9e3d3;color:#33312a;font:16px/1.8 system-ui,sans-serif;margin:0;padding:24px}main{max-width:600px;margin:8vh auto;background:#fffdf4;border:1px solid #33312a;padding:28px}label{display:block;margin-top:18px}input,button{font:inherit;box-sizing:border-box;width:100%;padding:12px;margin-top:8px;min-height:48px}button{background:#33312a;color:#fffdf4;border:0;cursor:pointer}button:disabled{opacity:.6}small{color:#68614f}a{color:#276a35}#status{min-height:50px}</style><main><h1>只差录入智谱 Key</h1><p>此页只在你的 Mac 本机运行。Key 将通过已授权的 Cloudflare 登录上传为 Worker Secret，不写入源码、聊天或本地文件。</p><p><small>目标：${relayUrl}<br>中转只接受万事屋网站与有效登录凭据。对话和截图仍会发送给智谱，中转不记录正文。</small></p><form><label for="key">智谱 API Key</label><input id="key" type="password" autocomplete="off" spellcheck="false" required minlength="16" maxlength="2048"><button id="submit">安全配置并验证登录</button></form><p id="status" role="status" aria-live="polite"></p><p><a href="https://anniieemo.github.io/master-board/" target="_blank" rel="noopener">返回万事屋</a></p><small>不要把 Key 发到聊天。配置成功后，此页会清空输入框；关闭前请等待成功提示。</small></main><script>document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const b=document.querySelector('button'),s=document.querySelector('#status'),i=document.querySelector('input');b.disabled=true;s.textContent='正在上传密钥并验证中转登录，请等待…';try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:i.value.trim()})});i.value='';const d=await r.json();if(!r.ok)throw new Error(d.error);s.textContent='配置成功，智谱 Key 已保存为 Cloudflare Secret，中转登录已验证。可以回到万事屋测试连接。';b.textContent='配置已完成';}catch(e){s.textContent=e.message;i.value='';b.disabled=false;}});</script></html>`;
function upload(key) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "wrangler@4.151.3", "secret", "put", "ZHIPU_API_KEY", "--config", fileURLToPath(new URL("wrangler.jsonc", import.meta.url))], { stdio: ["pipe", "ignore", "ignore"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    child.on("error", reject);
    child.stdin.on("error", () => {});
    child.once("exit", code => code === 0 ? resolve() : reject(new Error("密钥上传未成功，请检查 Cloudflare 登录后重试")));
    child.stdin.end(key + "\n");
  });
}
const server = http.createServer(async (req, res) => {
  const base = "http://127.0.0.1:" + server.address().port;
  res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "no-referrer"); res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  const json = (code, data) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (req.headers.host !== "127.0.0.1:" + server.address().port) return json(403, { error: "本机地址不匹配" });
  if (req.url === route + "/status" && req.method === "GET") return json(200, { complete, busy });
  // Used only by the local browser QA session; this short-lived process is stopped at handoff.
  if (req.url === route + "/session" && req.method === "GET") return session ? json(200, session) : json(409, { error: "尚未完成配置" });
  if (req.url !== route) return json(404, { error: "页面不存在" });
  if (req.method === "GET") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(page); }
  if (req.method !== "POST" || req.headers.origin !== base || req.headers["content-type"] !== "application/json") return json(403, { error: "请求来源不匹配" });
  if (busy || complete) return json(409, { error: complete ? "已配置完成，无需重复提交" : "正在配置，请等待" });
  busy = true;
  try {
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 4096) throw new Error("输入过长"); }
    const data = JSON.parse(raw); raw = "";
    let key = typeof data.key === "string" ? data.key.trim() : ""; delete data.key;
    if (key.length < 16 || key.length > 2048 || /\s/.test(key)) throw new Error("Key 格式不正确，请重新粘贴");
    await upload(key);
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(relayUrl + "/session", { method: "POST", headers: { Origin: "https://anniieemo.github.io", Authorization: "Bearer " + key }, signal: AbortSignal.timeout(20000), redirect: "error" });
      if (response.ok || response.status !== 503) break;
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }
    key = "";
    if (!response?.ok) throw new Error("密钥已上传，但中转登录暂未通过；请等待部署生效后重试");
    session = await response.json(); complete = true;
    console.log("Cloudflare secret configured; relay session verified. No credential values logged.");
    json(200, { ok: true });
  } catch (error) { json(400, { error: error instanceof SyntaxError ? "输入格式不正确" : error.message }); }
  finally { busy = false; }
});
server.requestTimeout = 120000;
server.listen(0, "127.0.0.1", () => console.log("Secure setup: http://127.0.0.1:" + server.address().port + route));
const shutdown = () => { if (closed) return; closed = true; session = null; server.close(); setTimeout(() => process.exit(0), 500).unref(); };
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
setTimeout(shutdown, 45 * 60 * 1000).unref();
