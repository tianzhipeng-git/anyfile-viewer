import { parentPort } from "node:worker_threads";
import { basename, dirname } from "node:path";
import {
  AgentError,
  type AgentFileError,
  type ExtractContext,
  type InspectPayload,
  type QueryParams,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";
import { normalizeMaxBytes, toAgentFileError, trimInspectPayload, trimReadResult } from "./budget";
import { createDiskFile, DiskBinarySource } from "./disk-io";
import { extractorLoaders } from "./generated/extractors";
import { createDiskWorkspaceReader } from "./security";

export interface WorkerRequest {
  readonly id: number;
  readonly op: "inspect" | "read" | "query" | "capabilities" | "shutdown";
  readonly pluginId?: string;
  readonly filePath?: string;
  readonly size?: number;
  readonly mtimeMs?: number;
  readonly workspaceAccess?: "none" | "optional" | "required";
  readonly readParams?: ReadParams;
  readonly queryParams?: QueryParams;
}

export interface WorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: AgentFileError;
}

interface SessionCacheEntry {
  readonly key: string;
  readonly source: DiskBinarySource;
  readonly file: File;
  lastUsedAt: number;
}

const MAX_SESSIONS = 16;
const SESSION_IDLE_MS = 5 * 60 * 1000;

const extractorCache = new Map<string, Promise<StructuredExtractor>>();
const sessionCache = new Map<string, SessionCacheEntry>();

function evictExpiredSessions(now = Date.now()): void {
  for (const [key, entry] of sessionCache) {
    if (now - entry.lastUsedAt > SESSION_IDLE_MS) {
      entry.source.close();
      sessionCache.delete(key);
    }
  }
}

function getOrCreateSession(
  filePath: string,
  size: number,
  mtimeMs: number,
  pluginId: string,
): SessionCacheEntry {
  const now = Date.now();
  evictExpiredSessions(now);
  const key = `${filePath}\0${size}\0${mtimeMs}\0${pluginId}`;
  const existing = sessionCache.get(key);
  if (existing) {
    existing.lastUsedAt = now;
    // Refresh LRU order
    sessionCache.delete(key);
    sessionCache.set(key, existing);
    return existing;
  }

  if (sessionCache.size >= MAX_SESSIONS) {
    const oldestKey = sessionCache.keys().next().value;
    if (oldestKey !== undefined) {
      sessionCache.get(oldestKey)?.source.close();
      sessionCache.delete(oldestKey);
    }
  }

  const name = basename(filePath);
  const source = new DiskBinarySource(filePath, size, name);
  const file = createDiskFile(filePath, name, size, mtimeMs);
  const entry: SessionCacheEntry = { key, source, file, lastUsedAt: now };
  sessionCache.set(key, entry);
  return entry;
}

function closeAllSessions(): void {
  for (const entry of sessionCache.values()) {
    entry.source.close();
  }
  sessionCache.clear();
}

async function loadExtractor(pluginId: string): Promise<StructuredExtractor> {
  const loader = extractorLoaders[pluginId];
  if (!loader) {
    throw new AgentError(
      "unsupported-capability",
      `Plugin "${pluginId}" does not support structured extraction.`,
      { pluginId },
    );
  }
  let cached = extractorCache.get(pluginId);
  if (!cached) {
    cached = loader();
    extractorCache.set(pluginId, cached);
  }
  return cached;
}

function buildContext(req: WorkerRequest, session: SessionCacheEntry, signal: AbortSignal): ExtractContext {
  const workspace =
    req.workspaceAccess && req.workspaceAccess !== "none" && req.filePath
      ? createDiskWorkspaceReader(dirname(req.filePath))
      : undefined;
  return {
    source: session.source,
    file: session.file,
    ...(workspace ? { workspace, relativePath: basename(req.filePath!) } : {}),
    signal,
  };
}

async function handleRequest(req: WorkerRequest): Promise<unknown> {
  if (req.op === "shutdown") {
    closeAllSessions();
    return { ok: true };
  }

  const pluginId = req.pluginId ?? "";
  if (req.op === "capabilities") {
    const loader = extractorLoaders[pluginId];
    if (!loader) return [];
    const extractor = await loadExtractor(pluginId);
    const caps: ("read" | "query" | "render")[] = ["read"];
    if (typeof extractor.query === "function") caps.push("query");
    if (typeof extractor.renderImage === "function") caps.push("render");
    return caps;
  }

  if (!req.filePath || typeof req.size !== "number" || typeof req.mtimeMs !== "number") {
    throw new AgentError("invalid-file", "Missing file metadata for worker request.", { pluginId });
  }

  const extractor = await loadExtractor(pluginId);
  const session = getOrCreateSession(req.filePath, req.size, req.mtimeMs, pluginId);
  const controller = new AbortController();
  const context = buildContext(req, session, controller.signal);

  if (req.op === "inspect") {
    const payload: InspectPayload = await extractor.inspect(context);
    return trimInspectPayload(payload);
  }

  if (req.op === "read") {
    const maxBytes = normalizeMaxBytes(req.readParams?.maxBytes);
    const result: ReadResult = await extractor.read(context, {
      ...req.readParams,
      maxBytes,
    });
    return trimReadResult(result, maxBytes);
  }

  if (req.op === "query") {
    if (typeof extractor.query !== "function") {
      throw new AgentError(
        "unsupported-capability",
        `Plugin "${pluginId}" does not support SQL queries.`,
        { pluginId },
      );
    }
    const maxBytes = normalizeMaxBytes(req.queryParams?.maxBytes);
    const result: ReadResult = await extractor.query(context, {
      sql: req.queryParams?.sql ?? "",
      target: req.queryParams?.target,
      cursor: req.queryParams?.cursor,
      maxBytes,
    });
    return trimReadResult(result, maxBytes);
  }

  throw new AgentError("unsupported-capability", `Unknown worker operation: ${String(req.op)}`, { pluginId });
}

if (parentPort) {
  const port = parentPort;
  port.on("message", async (req: WorkerRequest) => {
    try {
      const result = await handleRequest(req);
      const response: WorkerResponse = { id: req.id, ok: true, result };
      port.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = {
        id: req.id,
        ok: false,
        error: toAgentFileError(error, req.pluginId),
      };
      port.postMessage(response);
    }
  });
}
