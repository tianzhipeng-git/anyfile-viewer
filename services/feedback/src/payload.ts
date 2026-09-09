export class RequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

export type FeedbackPayload = {
  submissionId: string;
  category: "bug" | "feature" | "other";
  message: string;
  email: string;
  context: Record<string, string>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function limitedString(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) throw new RequestError(400, "invalid_payload");
  return value.trim();
}

export async function readPayload(request: Request): Promise<FeedbackPayload> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
    throw new RequestError(415, "json_required");
  }
  // Bound the actual stream; Content-Length alone can be absent or misleading.
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "invalid_payload");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        throw new RequestError(413, "payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new RequestError(400, "invalid_payload"); }
  if (!record(value)) throw new RequestError(400, "invalid_payload");
  const allowed = ["submissionId", "category", "message", "email", "context", "website"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new RequestError(400, "invalid_payload");
  if (limitedString(value.website ?? "", 200)) throw new RequestError(400, "invalid_payload");
  const submissionId = limitedString(value.submissionId, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw new RequestError(400, "invalid_payload");
  }
  const category = value.category;
  if (category !== "bug" && category !== "feature" && category !== "other") throw new RequestError(400, "invalid_payload");
  const message = limitedString(value.message, 2000);
  if (!message) throw new RequestError(400, "invalid_payload");
  const email = limitedString(value.email ?? "", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError(400, "invalid_payload");
  const context: Record<string, string> = {};
  if (value.context !== undefined) {
    if (!record(value.context)) throw new RequestError(400, "invalid_payload");
    const limits: Record<string, number> = { locale: 16, format: 24, pluginId: 100, appVersion: 64 };
    for (const key of Object.keys(value.context).sort()) {
      if (!Object.hasOwn(limits, key)) throw new RequestError(400, "invalid_payload");
      context[key] = limitedString(value.context[key], limits[key]);
    }
  }
  return { submissionId: submissionId.toLowerCase(), category, message, email, context };
}
