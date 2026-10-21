// The Pages hostname is an ingress only. Auth, CORS and limits stay in the Worker.
export default {
  async fetch(request, env) {
    try { return await env.LLM_RELAY.fetch(request); }
    catch {
      const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
      if (request.headers.get("Origin") === "https://anniieemo.github.io") headers["Access-Control-Allow-Origin"] = "https://anniieemo.github.io";
      return Response.json({ error: { code: "RELAY_UNAVAILABLE", message: "安全中转暂不可用，请稍后重试" } }, { status: 503, headers });
    }
  }
};
