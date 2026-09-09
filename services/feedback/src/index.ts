import { isAllowedOrigin } from "./projects";
import { readPayload, RequestError } from "./payload";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/v1\/projects\/([a-z0-9-]{1,64})\/feedback$/.exec(url.pathname);
    const origin = request.headers.get("Origin") ?? "";
    const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
    const json = (status: number, body: object) => Response.json(body, { status, headers });
    if (!match) return json(404, { error: "not_found" });
    const project = match[1];
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!isAllowedOrigin(project, origin, local)) return json(403, { error: "origin_not_allowed" });
    headers.set("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") {
      headers.set("Access-Control-Allow-Methods", "POST");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      headers.set("Allow", "POST, OPTIONS");
      return json(405, { error: "method_not_allowed" });
    }
    try {
      // Cloudflare supplies this header. Do not trust X-Forwarded-For.
      const ip = request.headers.get("CF-Connecting-IP") ?? (local ? "local" : "unknown");
      const sourceLimit = await env.SOURCE_LIMIT.limit({ key: `${project}:${ip}` });
      if (!sourceLimit.success) throw new RequestError(429, "rate_limited");
      const projectLimit = await env.PROJECT_LIMIT.limit({ key: project });
      if (!projectLimit.success) throw new RequestError(429, "rate_limited");
      const payload = await readPayload(request);
      const context = JSON.stringify(payload.context);
      const inserted = await env.DB.prepare(
        `INSERT INTO feedback (project_key, submission_id, category, message, email, context)
         VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (project_key, submission_id) DO NOTHING`,
      ).bind(project, payload.submissionId, payload.category, payload.message, payload.email, context).run();
      if (!inserted.meta.changes) {
        const existing = await env.DB.prepare(
          "SELECT category, message, email, context FROM feedback WHERE project_key = ? AND submission_id = ?",
        ).bind(project, payload.submissionId).first<{ category: string; message: string; email: string; context: string }>();
        if (!existing || existing.category !== payload.category || existing.message !== payload.message
          || existing.email !== payload.email || existing.context !== context) {
          throw new RequestError(409, "submission_conflict");
        }
      }
      return json(inserted.meta.changes ? 201 : 200, { submissionId: payload.submissionId });
    } catch (error) {
      if (error instanceof RequestError) {
        if (error.status === 429) headers.set("Retry-After", "60");
        return json(error.status, { error: error.code });
      }
      // Never log the request, feedback text, email, IP, or SQL error details.
      console.error(JSON.stringify({ event: "feedback_failed", project }));
      return json(503, { error: "temporarily_unavailable" });
    }
  },
} satisfies ExportedHandler<Env>;
