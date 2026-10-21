// Personal relay. The only upstream is fixed; secrets and prompts are never logged.
const UPSTREAM = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const MAX_BODY = 6 * 1024 * 1024;
const encoder = new TextEncoder();
const encode64 = bytes => btoa(Array.from(bytes, n => String.fromCharCode(n)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function decode64(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error("Invalid token");
  return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
async function signingKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode("master-board-session-v1:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest("SHA-256", encoder.encode(s))));
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}
async function issueSession(secret, origin) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encode64(encoder.encode(JSON.stringify({ iss: "master-board-relay-v1", sub: "owner", aud: origin, iat: now, exp: now + SESSION_SECONDS })));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload));
  return { token: payload + "." + encode64(new Uint8Array(signature)), expiresAt: (now + SESSION_SECONDS) * 1000 };
}
async function validSession(token, secret, origin) {
  try {
    if (token.length > 2048) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const verified = await crypto.subtle.verify("HMAC", await signingKey(secret), decode64(parts[1]), encoder.encode(parts[0]));
    if (!verified) return false;
    const p = JSON.parse(new TextDecoder().decode(decode64(parts[0]))), now = Date.now() / 1000;
    return p.iss === "master-board-relay-v1" && p.sub === "owner" && p.aud === origin && Number.isFinite(p.iat) && Number.isFinite(p.exp) && p.iat <= now + 60 && p.exp > now && p.exp - p.iat === SESSION_SECONDS;
  } catch { return false; }
}
function responseHeaders(origin) {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}
function json(status, body, origin, extra = {}) {
  const headers = responseHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [key, val] of Object.entries(extra)) headers.set(key, val);
  return new Response(JSON.stringify(body), { status, headers });
}
const fail = (status, code, message, origin, extra) => json(status, { error: { code, message } }, origin, extra);
const bearer = request => request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1] || "";
async function limitedJson(request) {
  const declared = request.headers.get("Content-Length");
  if (declared && Number(declared) > MAX_BODY) throw new Error("size");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("json");
  const chunks = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) { await reader.cancel(); throw new Error("size"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function cleanPayload(input, models) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("请求格式不正确");
  if (Object.keys(input).some(k => !["model", "messages", "temperature", "max_tokens", "stream"].includes(k))) throw new Error("请求包含不支持的字段");
  if (!models.includes(input.model)) throw new Error("模型未在中转允许列表中配置");
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 64) throw new Error("消息数量须为 1–64 条");
  const messages = input.messages.map(m => {
    if (!m || !["system", "user", "assistant"].includes(m.role)) throw new Error("消息角色不支持");
    let content = m.content;
    if (Array.isArray(content)) content = content.map(part => {
      if (part?.type === "text" && typeof part.text === "string") return { type: "text", text: part.text };
      if (m.role === "user" && part?.type === "image_url" && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(part.image_url?.url || "")) return { type: "image_url", image_url: { url: part.image_url.url } };
      throw new Error("图片只接受本机上传的图片数据");
    });
    else if (typeof content !== "string") throw new Error("消息内容不正确");
    return { role: m.role, content };
  });
  const maxTokens = input.max_tokens ?? 3000, temperature = input.temperature ?? 0.3;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) throw new Error("max_tokens 须为 1–4096");
  if (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error("temperature 须为 0–2");
  if (input.stream !== undefined && typeof input.stream !== "boolean") throw new Error("stream 须为布尔值");
  return { model: input.model, messages, max_tokens: maxTokens, temperature, stream: input.stream === true };
}
export function createRelay(fetchUpstream = (...args) => globalThis.fetch(...args)) {
  return async function handle(request, env) {
    const path = new URL(request.url).pathname;
    const allowed = env.ALLOWED_ORIGIN || "https://anniieemo.github.io";
    const origin = request.headers.get("Origin") === allowed ? allowed : "";
    const configured = typeof env.ZHIPU_API_KEY === "string" && env.ZHIPU_API_KEY.length >= 16 && !/[\r\n]/.test(env.ZHIPU_API_KEY);
    if (path === "/health" && request.method === "GET") return json(200, { ok: true, configured, version: 1 }, origin);
    if (!origin) return fail(403, "ORIGIN_DENIED", "此来源不允许访问中转", "");
    if (!["/session", "/v1/chat/completions"].includes(path)) return fail(404, "NOT_FOUND", "接口不存在", origin);
    if (request.method === "OPTIONS") {
      const method = request.headers.get("Access-Control-Request-Method");
      const headers = (request.headers.get("Access-Control-Request-Headers") || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
      if (method !== "POST" || headers.some(h => !["authorization", "content-type"].includes(h))) return fail(403, "PREFLIGHT_DENIED", "预检请求不允许", origin);
      return new Response(null, { status: 204, headers: responseHeaders(origin) });
    }
    if (request.method !== "POST") return fail(405, "METHOD_DENIED", "仅支持 POST", origin, { Allow: "POST, OPTIONS" });
    if (!configured || !env.CHAT_LIMITER?.limit || !env.LOGIN_LIMITER?.limit) return fail(503, "NOT_CONFIGURED", "中转尚未完成密钥或限流配置", origin);
    const token = bearer(request);
    if (!token || token.length > 4096) return fail(401, "SESSION_REQUIRED", "请在设置中登录中转", origin);
    if (path === "/session") {
      if (!(await env.LOGIN_LIMITER.limit({ key: "owner-login" })).success) return fail(429, "LOGIN_RATE_LIMITED", "登录尝试过多，请 60 秒后重试", origin, { "Retry-After": "60" });
      if (!(await sameSecret(token, env.ZHIPU_API_KEY))) return fail(401, "LOGIN_DENIED", "Key 与中转服务器配置不一致，请检查", origin);
      return json(200, await issueSession(env.ZHIPU_API_KEY, allowed), origin);
    }
    if (!(await validSession(token, env.ZHIPU_API_KEY, allowed))) return fail(401, "SESSION_EXPIRED", "中转登录已失效，请在设置中重新登录", origin);
    if (!(await env.CHAT_LIMITER.limit({ key: "owner-chat" })).success) return fail(429, "RATE_LIMITED", "请求较频繁，请 60 秒后重试", origin, { "Retry-After": "60" });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") || "")) return fail(415, "CONTENT_TYPE", "请求需要 application/json", origin);
    let payload;
    try { payload = cleanPayload(await limitedJson(request), (env.ALLOWED_MODELS || "glm-5.3-flash,glm-4v-flash,glm-4-flash").split(",").map(s => s.trim())); }
    catch (error) { return fail(error.message === "size" ? 413 : 400, "INVALID_REQUEST", error.message === "size" ? "请求超过 6 MB，请缩小图片或对话" : error instanceof SyntaxError ? "JSON 格式不正确" : error.message, origin); }
    let upstream;
    try {
      upstream = await fetchUpstream(UPSTREAM, {
        method: "POST", redirect: "manual",
        headers: { "Authorization": "Bearer " + env.ZHIPU_API_KEY, "Content-Type": "application/json", "Accept": payload.stream ? "text/event-stream" : "application/json" },
        body: JSON.stringify(payload), signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)])
      });
    } catch { return fail(502, "UPSTREAM_NETWORK", "中转已收到请求，但连接智谱失败；请稍后重试", origin); }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      const message = [401, 403].includes(upstream.status) ? "智谱鉴权失败，请检查服务器上的 Key 与权限" : upstream.status === 429 ? "智谱额度或频率受限，请检查账户额度" : "智谱拒绝请求，请检查模型、参数或服务状态";
      return fail(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, "UPSTREAM_" + upstream.status, message, origin);
    }
    const type = upstream.headers.get("Content-Type") || "";
    if (!(payload.stream ? type.includes("text/event-stream") : type.includes("application/json"))) {
      await upstream.body?.cancel();
      return fail(502, "UPSTREAM_FORMAT", "智谱返回了非预期格式，未将其当成模型回复", origin);
    }
    const headers = responseHeaders(origin);
    headers.set("Content-Type", payload.stream ? "text/event-stream; charset=utf-8" : "application/json; charset=utf-8");
    return new Response(upstream.body, { status: 200, headers });
  };
}
export default { fetch: createRelay() };
