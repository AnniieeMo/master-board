import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createRelay } from "./worker.mjs";
const client = createRequire(import.meta.url)("../assets/llm-client.js");
const ORIGIN = "https://anniieemo.github.io", KEY = "test-only-upstream-key-never-live";
const env = () => ({ ALLOWED_ORIGIN: ORIGIN, ZHIPU_API_KEY: KEY, CHAT_LIMITER: { limit: async () => ({ success: true }) }, LOGIN_LIMITER: { limit: async () => ({ success: true }) } });
const body = () => ({ model: "glm-5.3-flash", messages: [{ role: "user", content: "test" }], max_tokens: 64, stream: false });
const req = (path, token = "", payload, origin = ORIGIN) => new Request("https://relay.example" + path, { method: "POST", headers: { Origin: origin, Authorization: "Bearer " + token, "Content-Type": "application/json" }, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });
async function login(handler, bindings = env()) { const r = await handler(req("/session", KEY), bindings); assert.equal(r.status, 200); return (await r.json()).token; }

test("OPTIONS allows the board, without authentication or upstream traffic", async () => {
  const handler = createRelay(() => assert.fail("preflight must not call upstream"));
  const r = await handler(new Request("https://relay.example/v1/chat/completions", { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } }), {});
  assert.equal(r.status, 204); assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});
test("foreign origins are rejected and receive no CORS permission", async () => {
  const r = await createRelay()(req("/session", KEY, undefined, "https://evil.example"), env());
  assert.equal(r.status, 403); assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
});
test("unconfigured workers fail closed", async () => {
  assert.equal((await createRelay()(req("/session", KEY), { ALLOWED_ORIGIN: ORIGIN })).status, 503);
});
test("missing rate-limit binding fails closed", async () => {
  const bindings = env(); delete bindings.CHAT_LIMITER;
  assert.equal((await createRelay()(req("/session", KEY), bindings)).status, 503);
});
test("wrong login credentials cannot obtain a session", async () => {
  const r = await createRelay()(req("/session", "wrong-key"), env());
  assert.equal(r.status, 401); assert.ok(!(await r.text()).includes(KEY));
});
test("login returns a finite session, never the upstream key", async () => {
  const r = await createRelay()(req("/session", KEY), env()), data = await r.json();
  assert.ok(data.token.includes(".")); assert.ok(data.expiresAt > Date.now()); assert.ok(!JSON.stringify(data).includes(KEY));
});
test("bare API keys are not accepted on the model endpoint", async () => {
  assert.equal((await createRelay()(req("/v1/chat/completions", KEY, body()), env())).status, 401);
});
test("forged sessions and sessions signed by an old key are rejected", async () => {
  const handler = createRelay(), token = await login(handler);
  assert.equal((await handler(req("/v1/chat/completions", token + "x", body()), env())).status, 401);
  assert.equal((await handler(req("/v1/chat/completions", token, body()), { ...env(), ZHIPU_API_KEY: KEY + "rotated" })).status, 401);
});
test("correct sessions forward to one fixed upstream with server credentials", async () => {
  let calls = 0;
  const handler = createRelay(async (url, init) => { calls++; assert.equal(url, "https://open.bigmodel.cn/api/paas/v4/chat/completions"); assert.equal(init.headers.Authorization, "Bearer " + KEY); assert.equal(init.redirect, "manual"); return Response.json({ choices: [{ message: { content: "OK" } }] }); });
  const token = await login(handler), r = await handler(req("/v1/chat/completions", token, body()), env());
  assert.equal(r.status, 200); assert.equal(calls, 1); assert.equal(r.headers.get("Cache-Control"), "no-store");
});
test("chat and login limits do not contact the upstream", async () => {
  const handler = createRelay(() => assert.fail("rate-limited calls must not be forwarded")), token = await login(handler);
  const blocked = { limit: async () => ({ success: false }) };
  assert.equal((await handler(req("/v1/chat/completions", token, body()), { ...env(), CHAT_LIMITER: blocked })).status, 429);
  assert.equal((await handler(req("/session", KEY), { ...env(), LOGIN_LIMITER: blocked })).status, 429);
});
test("upstream redirects are rejected, not followed with the server key", async () => {
  let count = 0;
  const handler = createRelay(async (_url, init) => { count++; assert.equal(init.redirect, "manual"); return new Response(null, { status: 302, headers: { Location: "https://evil.example", "Set-Cookie": "private=yes" } }); });
  const token = await login(handler), r = await handler(req("/v1/chat/completions", token, body()), env());
  assert.equal(count, 1); assert.equal(r.status, 502); assert.equal(r.headers.get("Location"), null); assert.equal(r.headers.get("Set-Cookie"), null);
});
test("unknown models, arbitrary targets and remote image URLs are rejected", async () => {
  const handler = createRelay(() => assert.fail("invalid input forwarded")), token = await login(handler);
  for (const payload of [{ ...body(), model: "unapproved-model" }, { ...body(), url: "https://evil.example" }, { ...body(), messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "http://127.0.0.1/" } }] }] }, { ...body(), max_tokens: 100000 }]) {
    assert.equal((await handler(req("/v1/chat/completions", token, payload), env())).status, 400);
  }
});
test("large and malformed bodies are rejected", async () => {
  const handler = createRelay(), token = await login(handler);
  const large = req("/v1/chat/completions", token, body()); large.headers.set("Content-Length", "10000000");
  assert.equal((await handler(large, env())).status, 413);
  const malformed = new Request("https://relay.example/v1/chat/completions", { method: "POST", headers: { Origin: ORIGIN, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: "{" });
  assert.equal((await handler(malformed, env())).status, 400);
});
test("upstream authentication and network errors are not mislabeled CORS", async () => {
  for (const [status, expected] of [[401, "UPSTREAM_401"], [429, "UPSTREAM_429"]]) {
    const handler = createRelay(async () => new Response("secret diagnostic detail", { status })), token = await login(handler);
    const r = await handler(req("/v1/chat/completions", token, body()), env()), data = await r.json();
    assert.equal(r.status, status); assert.equal(data.error.code, expected); assert.ok(!JSON.stringify(data).includes("secret diagnostic detail"));
  }
  const handler = createRelay(async () => { throw new Error("private detail"); }), token = await login(handler);
  assert.equal((await handler(req("/v1/chat/completions", token, body()), env())).status, 502);
});
test("streamed output crosses the relay without buffering or losing final lines", async () => {
  const sse = 'data: {"choices":[{"delta":{"reasoning_content":"reason"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]';
  const bytes = new TextEncoder().encode(sse);
  const handler = createRelay(async () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } }), { headers: { "Content-Type": "text/event-stream" } }));
  const token = await login(handler), r = await handler(req("/v1/chat/completions", token, { ...body(), stream: true }), env());
  let visible = "", reasoning = "";
  assert.equal(await client.readStream(r, { onDelta: s => { visible += s; }, onReasoning: s => { reasoning += s; } }), "你好");
  assert.equal(visible, "你好"); assert.equal(reasoning, "reason");
});
test("truncated streams do not silently become completed replies", async () => {
  await assert.rejects(client.readStream(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n')), /中断/);
});
test("client logs in, clears the board's key, then uses only the session", async () => {
  const handler = createRelay(async () => Response.json({ choices: [{ message: { content: "OK" } }] }));
  const calls = [], config = { transport: "relay", relayUrl: "https://relay.example", key: KEY };
  const send = async (url, init) => { calls.push({ url, auth: init.headers.Authorization }); return handler(new Request(url, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env()); };
  let saves = 0;
  await client.request(config, body(), { fetch: send, onSession: () => { saves++; } });
  assert.equal(config.key, ""); assert.equal(saves, 1); assert.equal(calls[0].url, "https://relay.example/session");
  assert.ok(calls[1].auth !== "Bearer " + KEY); assert.ok(client.ready(config));
  await client.request(config, body(), { fetch: send }); assert.equal(calls.length, 3);
});
test("expired sessions and insecure relay URLs produce actionable errors", async () => {
  await assert.rejects(client.request({ transport: "relay", relayUrl: "https://relay.example", session: "expired", sessionExpiresAt: 1 }, body()), /登录已失效/);
  for (const relayUrl of ["http://evil.example", "https://relay.example/?key=secret", "https://relay.example/path", "https://user:pass@relay.example"]) assert.throws(() => client.relayBase({ relayUrl }));
});
test("browser network errors retain CORS as a possible cause", async () => {
  await assert.rejects(client.request({ key: "test", base: "https://example.com" }, body(), { fetch: async () => { throw new TypeError("Failed to fetch"); } }), /CORS/);
});
