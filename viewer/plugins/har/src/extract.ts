import {
  AgentError,
  ViewerError,
  abortError,
  isViewerAbortError,
  paginateLines,
  parsePositionCursor,
  renderMarkdownTablePage,
  truncateUtf8,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";

import { readHar } from "./parse";
import type { HarDocument, HarEntry, HarNameValue } from "./types";

const PLUGIN_ID = "http-archive";
const MAX_ENTRY_TARGETS = 50;
const MAX_HOSTS = 20;
/** Request/response bodies are cut to this many UTF-8 bytes in entry detail. */
const BODY_CAP = 16 * 1024;
const ENTRY_COLUMNS = ["#", "Started", "Method", "Status", "URL", "MIME", "Size", "Time (ms)"];

async function load(context: ExtractContext): Promise<HarDocument> {
  if (context.signal.aborted) throw abortError();
  try {
    return await readHar(context.file, context.signal, () => undefined);
  } catch (error) {
    if (isViewerAbortError(error)) throw error;
    if (error instanceof ViewerError && error.code === "resource-limit") {
      throw new AgentError("resource-limit", "The HAR file is larger than 128 MiB.", { pluginId: PLUGIN_ID, cause: error });
    }
    throw new AgentError("invalid-file", "The file is damaged or is not a valid HAR file.", { pluginId: PLUGIN_ID, cause: error });
  }
}

function host(url: string): string {
  try {
    return new URL(url).host || "(none)";
  } catch {
    return "(invalid URL)";
  }
}

const responseSize = (entry: HarEntry) => entry.response.content.size ?? entry.response.bodySize;
const startMs = (entry: HarEntry) => (entry.startedDateTime ? Date.parse(entry.startedDateTime) : Number.NaN);

function entryRow(entry: HarEntry, index: number): string[] {
  const size = responseSize(entry);
  return [
    String(index + 1),
    entry.startedDateTime ?? "",
    entry.request.method,
    String(entry.response.status),
    entry.request.url,
    entry.response.content.mimeType ?? "",
    size === undefined || size < 0 ? "" : String(size),
    String(Math.round(entry.time * 10) / 10),
  ];
}

function readEntries(entries: readonly HarEntry[], params: ReadParams): ReadResult {
  const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
  if (start > entries.length) {
    throw new AgentError("target-not-found", `Cursor row ${start} is out of range.`, { pluginId: PLUGIN_ID });
  }
  const needle = params.filter?.trim().toLowerCase();
  const result = renderMarkdownTablePage({
    columns: ENTRY_COLUMNS,
    rows: entries.slice(start).map((entry, offset) => {
      const row = entryRow(entry, start + offset);
      return !needle || row.some((cell) => cell.toLowerCase().includes(needle)) ? row : null;
    }),
    start,
    maxBytes: params.maxBytes,
    cursorPrefix: "row:",
  });
  return needle ? { ...result, filterApplied: true } : result;
}

/** Body text cut to `BODY_CAP` bytes; base64 bodies are decoded only when they are UTF-8 text. */
function bodyText(text: string, encoding: string | undefined): { text: string; truncated: boolean } | undefined {
  let decoded = text;
  let more = false;
  if (encoding === "base64") {
    const head = text.slice(0, (Math.ceil(BODY_CAP / 3) + 1) * 4);
    more = head.length < text.length;
    try {
      const bytes = Uint8Array.from(atob(head), (char) => char.charCodeAt(0));
      if (bytes.includes(0)) return undefined;
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
    } catch {
      return undefined;
    }
  }
  const capped = truncateUtf8(decoded, BODY_CAP);
  return { text: capped.text, truncated: capped.truncated || more };
}

function bodyLines(mimeType: string | undefined, text: string | undefined, encoding?: string): string[] {
  if (!text) return [];
  const heading = `### Body${mimeType ? ` (${mimeType})` : ""}`;
  const body = bodyText(text, encoding);
  if (!body) return [heading, `<binary body, ${text.length} encoded chars; not shown>`];
  return [
    heading,
    "~~~~",
    ...body.text.split(/\r?\n/),
    "~~~~",
    ...(body.truncated ? [`[body truncated to ${BODY_CAP} bytes]`] : []),
  ];
}

const pairLines = (title: string, pairs: readonly HarNameValue[]) =>
  pairs.length ? [`### ${title}`, ...pairs.map(({ name, value }) => `- ${name}: ${value}`)] : [];

function entryDetail(entry: HarEntry, index: number): string[] {
  const { request, response } = entry;
  const timings = Object.entries(entry.timings).filter(([, value]) => value >= 0);
  const size = responseSize(entry);
  return [
    `# Entry ${index + 1}: ${request.method} ${request.url}`,
    "",
    ...(entry.startedDateTime ? [`- **Started**: ${entry.startedDateTime}`] : []),
    `- **Time**: ${entry.time} ms`,
    ...(timings.length ? [`- **Timings**: ${timings.map(([name, value]) => `${name}=${value}`).join(", ")}`] : []),
    ...(entry.serverIPAddress ? [`- **Server IP**: ${entry.serverIPAddress}`] : []),
    "",
    "## Request",
    ...(request.httpVersion ? [`- **HTTP version**: ${request.httpVersion}`] : []),
    ...pairLines("Headers", request.headers),
    ...pairLines("Query string", request.queryString),
    ...pairLines("Form parameters", request.postData?.params ?? []),
    ...bodyLines(request.postData?.mimeType, request.postData?.text),
    "",
    "## Response",
    `- **Status**: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    ...(response.httpVersion ? [`- **HTTP version**: ${response.httpVersion}`] : []),
    ...(size !== undefined && size >= 0 ? [`- **Content size**: ${size} bytes`] : []),
    ...(response.redirectURL ? [`- **Redirect**: ${response.redirectURL}`] : []),
    ...pairLines("Headers", response.headers),
    ...bodyLines(response.content.mimeType, response.content.text, response.content.encoding),
  ];
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
}

const harExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const document = await load(context);
    const { entries } = document;
    const starts = entries.map(startMs).filter(Number.isFinite);
    const ends = entries.map((entry) => startMs(entry) + entry.time).filter(Number.isFinite);
    const hosts = countBy(entries, (entry) => host(entry.request.url));
    const targets: TargetEntry[] = [{ id: "entries", title: "Requests", kind: "table", size: entries.length }];
    for (const [index, entry] of entries.slice(0, MAX_ENTRY_TARGETS).entries()) {
      targets.push({ id: `entry:${index + 1}`, title: `${entry.request.method} ${entry.request.url}`.slice(0, 160), kind: "entry" });
    }
    return {
      metadata: {
        version: document.version ?? null,
        creator: document.creator ?? null,
        pageCount: document.pageCount,
        entryCount: entries.length,
        hostCount: Object.keys(hosts).length,
        hosts: Object.fromEntries(Object.entries(hosts).slice(0, MAX_HOSTS)),
        methods: countBy(entries, (entry) => entry.request.method),
        statusClasses: countBy(entries, (entry) => (entry.response.status > 0 ? `${String(entry.response.status)[0]}xx` : "failed")),
        ...(starts.length
          ? {
              firstStarted: new Date(Math.min(...starts)).toISOString(),
              lastFinished: new Date(Math.max(...ends)).toISOString(),
              spanMs: Math.round(Math.max(...ends) - Math.min(...starts)),
            }
          : {}),
        totalResponseBytes: entries.reduce((total, entry) => total + Math.max(0, responseSize(entry) ?? 0), 0),
        sizeBytes: context.source.size,
      },
      targets,
      ...(entries.length > MAX_ENTRY_TARGETS ? { targetsTruncated: true } : {}),
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const { entries } = await load(context);
    const target = params.target ?? "entries";
    if (target === "entries") return readEntries(entries, params);
    const match = /^entry:(\d+)$/.exec(target);
    const index = match ? Number(match[1]) - 1 : -1;
    const entry = entries[index];
    if (!entry) throw new AgentError("target-not-found", `HAR target not found: "${target}".`, { pluginId: PLUGIN_ID });
    let lines = entryDetail(entry, index);
    const needle = params.filter?.trim().toLowerCase();
    if (needle) lines = lines.filter((line) => line.toLowerCase().includes(needle));
    const page = paginateLines(lines, params.cursor, params.maxBytes, PLUGIN_ID);
    return {
      content: page.content,
      contentType: "markdown",
      truncated: page.truncated,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      ...(needle ? { filterApplied: true } : {}),
    };
  },
};

export default harExtractor;
