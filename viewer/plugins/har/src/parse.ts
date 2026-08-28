import { ViewerError, type ViewerProgress } from "@anyfile/viewer-protocol";

import type { HarDocument, HarEntry, HarNameValue, HarPostData } from "./types";

export const MAX_HAR_BYTES = 64 * 1024 * 1024;

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nameValues(value: unknown): HarNameValue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const pair = record(item);
    return pair && typeof pair.name === "string" && typeof pair.value === "string"
      ? [{ name: pair.name, value: pair.value }]
      : [];
  });
}

function postData(value: unknown): HarPostData | undefined {
  const data = record(value);
  if (!data) return undefined;
  return {
    mimeType: optionalString(data.mimeType),
    text: optionalString(data.text),
    params: nameValues(data.params),
  };
}

function parseEntry(value: unknown): HarEntry {
  const entry = record(value);
  const request = record(entry?.request);
  const response = record(entry?.response);
  const content = record(response?.content) ?? {};
  const rawTimings = record(entry?.timings) ?? {};
  if (!entry || !request || !response || typeof request.method !== "string"
    || typeof request.url !== "string" || optionalNumber(response.status) === undefined) {
    throw new Error("Invalid HAR entry");
  }

  const timings = Object.fromEntries(
    Object.entries(rawTimings).filter((item): item is [string, number] => optionalNumber(item[1]) !== undefined),
  );
  return {
    startedDateTime: optionalString(entry.startedDateTime),
    time: optionalNumber(entry.time) ?? 0,
    serverIPAddress: optionalString(entry.serverIPAddress),
    connection: optionalString(entry.connection),
    request: {
      method: request.method,
      url: request.url,
      httpVersion: optionalString(request.httpVersion),
      headers: nameValues(request.headers),
      queryString: nameValues(request.queryString),
      headersSize: optionalNumber(request.headersSize),
      bodySize: optionalNumber(request.bodySize),
      postData: postData(request.postData),
    },
    response: {
      status: response.status as number,
      statusText: optionalString(response.statusText),
      httpVersion: optionalString(response.httpVersion),
      headers: nameValues(response.headers),
      redirectURL: optionalString(response.redirectURL),
      headersSize: optionalNumber(response.headersSize),
      bodySize: optionalNumber(response.bodySize),
      content: {
        size: optionalNumber(content.size),
        compression: optionalNumber(content.compression),
        mimeType: optionalString(content.mimeType),
        text: optionalString(content.text),
        encoding: optionalString(content.encoding),
      },
    },
    timings,
  };
}

function parseDocument(text: string): HarDocument {
  const root = record(JSON.parse(text));
  const log = record(root?.log);
  if (!log || !Array.isArray(log.entries)) throw new Error("Invalid HAR document");
  const creator = record(log.creator);
  return {
    version: optionalString(log.version),
    creator: optionalString(creator?.name),
    pageCount: Array.isArray(log.pages) ? log.pages.length : 0,
    entries: log.entries.map(parseEntry),
  };
}

export async function readHar(
  file: File,
  signal: AbortSignal,
  reportProgress: (progress: ViewerProgress) => void,
): Promise<HarDocument> {
  if (file.size > MAX_HAR_BYTES) {
    throw new ViewerError("resource-limit", "HAR 文件超过 64 MiB，无法在浏览器中安全解析。", { cause: file.size });
  }
  if (signal.aborted) throw abortError();
  const reader = file.slice(0, file.size).stream().getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let loaded = 0;
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      loaded += result.value.byteLength;
      chunks.push(decoder.decode(result.value, { stream: true }));
      reportProgress({ stage: "reading", loaded, total: file.size });
    }
    chunks.push(decoder.decode());
    if (signal.aborted) throw abortError();
    return parseDocument(chunks.join(""));
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
