(function (root) {
  "use strict";
  function relayBase(config) {
    let url;
    try { url = new URL(config.relayUrl || ""); } catch { throw new Error("请在设置中填写中转地址"); }
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !local) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("中转地址须为 HTTPS 根地址，不要附带路径、密码或参数");
    return url.origin;
  }
  function ready(config) {
    if (config.transport !== "relay") return !!config.key;
    try { relayBase(config); } catch { return false; }
    return !!config.key || !!(config.session && config.sessionExpiresAt > Date.now() + 30000);
  }
  function networkError(error, relay) {
    if (error.name === "AbortError") return error;
    if (error.name === "TimeoutError") return new Error("连接超时，请稍后重试");
    return new Error(relay ? "浏览器未能连接中转：请检查中转地址、部署状态和跨域设置，不代表智谱 Key 错误" : "浏览器请求失败：可能是 CORS、网络或代理；若使用智谱，请改用安全中转，不要只反复重试");
  }
  async function getError(response) {
    try {
      const data = await response.json();
      const error = new Error((data.error?.message || "接口请求失败") + "（HTTP " + response.status + "）");
      error.code = data.error?.code;
      return error;
    } catch { return new Error("接口返回 HTTP " + response.status); }
  }
  async function request(config, payload, options = {}) {
    const relay = config.transport === "relay", send = options.fetch || root.fetch.bind(root);
    const signal = options.signal || AbortSignal.timeout(120000);
    let url, credential;
    if (relay) {
      const base = relayBase(config);
      if (!config.session || config.sessionExpiresAt <= Date.now() + 30000) {
        if (!config.key) throw new Error("中转登录已失效：请在设置中填入智谱 Key，登录成功后会清除工作台保存的 Key，仅保留 30 天登录凭据");
        let login;
        try { login = await send(base + "/session", { method: "POST", headers: { Authorization: "Bearer " + config.key }, signal, redirect: "error", cache: "no-store", credentials: "omit" }); }
        catch (error) { throw networkError(error, true); }
        if (!login.ok) throw await getError(login);
        const session = await login.json();
        if (typeof session.token !== "string" || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) throw new Error("中转登录返回了无效凭据");
        config.session = session.token;
        config.sessionExpiresAt = session.expiresAt;
        config.key = "";
        options.onSession?.();
      }
      url = base + "/v1/chat/completions";
      credential = config.session;
    } else {
      if (!config.key) throw new Error("请先在设置中填写对应服务商的 API Key");
      url = (config.base || "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, "") + "/chat/completions";
      credential = config.key;
    }
    let response;
    try { response = await send(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + credential }, body: JSON.stringify(payload), signal, redirect: "error", cache: "no-store", credentials: "omit" }); }
    catch (error) { throw networkError(error, relay); }
    if (!response.ok) {
      const error = await getError(response);
      if (relay && response.status === 401 && ["SESSION_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) { config.session = ""; config.sessionExpiresAt = 0; options.onSession?.(); }
      throw error;
    }
    return response;
  }
  async function readStream(response, handlers = {}) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "", full = "", ended = false;
    function line(text) {
      if (!text.startsWith("data:")) return;
      const payload = text.slice(5).trim();
      if (payload === "[DONE]") { ended = true; return; }
      let data;
      try { data = JSON.parse(payload); } catch { throw new Error("流式回复格式错误，请重新发送"); }
      if (data.error) throw new Error(data.error.message || "模型流式回复失败");
      const delta = data.choices?.[0]?.delta || {};
      if (delta.content) { full += delta.content; handlers.onDelta?.(delta.content); }
      if (delta.reasoning_content) handlers.onReasoning?.(delta.reasoning_content);
    }
    try {
      for (;;) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/); buffer = lines.pop();
        for (const text of lines) line(text);
        if (done) { if (buffer) line(buffer); break; }
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    if (!ended) throw new Error("模型连接在回复完成前中断，请重新发送；未自动重复提交");
    if (!full.trim()) throw new Error("模型未返回可用正文，请检查模型或增大输出额度");
    return full;
  }
  const api = { request, ready, readStream, relayBase, defaultRelayUrl: "https://master-board-relay-gateway.pages.dev" };
  root.MBLlm = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
