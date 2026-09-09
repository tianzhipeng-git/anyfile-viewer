import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const mf = new Miniflare({
  workers: [{
    config: {
      name: "feedback",
      type: "worker",
      compatibilityDate: "2026-09-09",
      compatibilityFlags: ["nodejs_compat"],
      manifest: {
        mainModule: "index.js",
        modules: { "index.js": { type: "esm", contents: await readFile("dist/index.js", "utf8") } },
      },
      env: {
        DB: { type: "d1", id: "feedback" },
        SOURCE_LIMIT: { type: "rate-limit", namespace: "900901", simple: { limit: 5, period: 60 } },
        PROJECT_LIMIT: { type: "rate-limit", namespace: "900902", simple: { limit: 100, period: 60 } },
      },
    },
  }],
});
let db;
let source = 0;
const origin = "https://www.anyfile.top";
const payload = () => ({ submissionId: crypto.randomUUID(), category: "bug", message: "测试反馈：PDF 显示空白", email: "", context: { locale: "zh-CN" } });
function send(body = payload(), options = {}) {
  return mf.dispatchFetch(`https://feedback.example/v1/projects/${options.project ?? "anyfile"}/feedback`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": `192.0.2.${++source}`, ...options.headers },
    body: JSON.stringify(body),
  });
}
before(async () => {
  db = await mf.getD1Database("DB");
  const sql = await readFile("migrations/0001_feedback.sql", "utf8");
  for (const statement of sql.split(";").filter((s) => s.trim())) await db.prepare(statement).run();
});
after(() => mf.dispose());

test("stores feedback and keeps identical retries idempotent, including concurrent requests", async () => {
  const body = payload();
  const responses = await Promise.all([send(body), send(body)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  for (const response of responses) {
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.deepEqual(await response.json(), { submissionId: body.submissionId });
  }
  const rows = await db.prepare("SELECT * FROM feedback WHERE submission_id = ?").bind(body.submissionId).all();
  assert.equal(rows.results.length, 1);
  assert.equal(rows.results[0].message, body.message);
  assert.equal(rows.results[0].project_key, "anyfile");
  assert.equal(rows.results[0].status, "new");
  assert.equal((await send({ ...body, message: "changed" })).status, 409);
});

test("rejects unknown projects, prototype keys, foreign origins and localhost on production", async () => {
  for (const project of ["unknown", "constructor"]) assert.equal((await send(payload(), { project })).status, 403);
  for (const invalidOrigin of ["https://evil.example", "http://localhost:3000", "null", ""]) {
    const response = await send(payload(), { headers: { Origin: invalidOrigin } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
});

test("does not offer public reads; allows a valid CORS preflight", async () => {
  const url = "https://feedback.example/v1/projects/anyfile/feedback";
  assert.equal((await mf.dispatchFetch(url, { headers: { Origin: origin } })).status, 405);
  const preflight = await mf.dispatchFetch(url, { method: "OPTIONS", headers: { Origin: origin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Methods"), "POST");
});

test("rejects malformed input, sensitive arbitrary context and honeypot without writes", async () => {
  const before = await db.prepare("SELECT count(*) AS n FROM feedback").first("n");
  for (const patch of [
    { message: " " }, { message: "a".repeat(2001) }, { email: "not-an-email" },
    { category: "admin" }, { submissionId: "bad" }, { website: "https://spam.example" },
    { context: { fileName: "secret.pdf" } }, { context: { format: "x".repeat(25) } },
    { file: "secret content" },
  ]) assert.equal((await send({ ...payload(), ...patch })).status, 400);
  assert.equal((await send(payload(), { headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await send({ ...payload(), message: "x".repeat(17_000) })).status, 413);
  assert.equal(await db.prepare("SELECT count(*) AS n FROM feedback").first("n"), before);
});

test("enforces source rate limits before writing feedback", async () => {
  const headers = { "CF-Connecting-IP": "198.51.100.123" };
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await send(payload(), { headers })).status);
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
});

test("database scopes the same submission id to each project", async () => {
  const body = payload();
  await send(body);
  await db.prepare("INSERT INTO feedback(project_key, submission_id, category, message) VALUES (?, ?, ?, ?)")
    .bind("another-project", body.submissionId, "other", "Separate feedback").run();
  const result = await db.prepare("SELECT count(*) AS n FROM feedback WHERE submission_id = ?").bind(body.submissionId).first("n");
  assert.equal(result, 2);
});

test("returns a retryable failure when storage is unavailable", async () => {
  await db.prepare("DROP TABLE feedback").run();
  const response = await send();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "temporarily_unavailable" });
});


test("limits project-wide traffic even when every request has a different source", async () => {
  let limited = false;
  for (let i = 0; i < 101; i++) {
    const response = await send({ ...payload(), message: "" });
    if (response.status === 429) {
      assert.equal(response.headers.get("Retry-After"), "60");
      limited = true;
      break;
    }
    assert.equal(response.status, 400);
  }
  assert.equal(limited, true);
});
