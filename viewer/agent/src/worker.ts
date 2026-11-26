import { parentPort } from "node:worker_threads";
import { basename } from "node:path";
import { viewerRegistryEntries } from "@anyfile/viewer-registry";
import {
  AgentError,
  localizeText,
  resolveViewerRegistrations,
  type AgentCapability,
  type AgentFileError,
  type ExtractContext,
  type InspectPayload,
  type InspectResult,
  type QueryParams,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type WorkspaceReader,
} from "@anyfile/viewer-protocol";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { normalizeMaxBytes, toAgentFileError, trimInspectPayload, trimReadResult } from "./budget";
import { DiskBinarySource, openDiskFile } from "./disk-io";
import { extractorLoaders } from "./generated/extractors";
import { createDiskWorkspaceReader } from "./security";

export interface WorkerRequest {
  readonly id: number;
  readonly op: "route" | "inspect" | "read" | "query";
  readonly pluginId?: string;
  readonly filePath?: string;
  readonly size?: number;
  readonly mtimeMs?: number;
  /** Directory sibling files may be read from; omitted when it lies outside the allowed roots. */
  readonly workspaceRoot?: string;
  readonly readParams?: ReadParams;
  readonly queryParams?: QueryParams;
}

export interface RouteResult {
  readonly pluginId: string;
  readonly formatName: string;
  readonly supportLevel: InspectResult["supportLevel"];
  readonly matchedBy: InspectResult["matchedBy"];
  readonly candidates: InspectResult["candidates"];
  readonly capabilities: readonly AgentCapability[];
}

export interface WorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: AgentFileError;
}

const vendor = createNodeVendorAssets();
const extractorCache = new Map<string, Promise<StructuredExtractor>>();

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

function workspaceOf(req: WorkerRequest) {
  return req.workspaceRoot ? createDiskWorkspaceReader(req.workspaceRoot) : undefined;
}

async function capabilitiesOf(pluginId: string): Promise<AgentCapability[]> {
  if (!extractorLoaders[pluginId]) return [];
  const extractor = await loadExtractor(pluginId);
  return [
    "read",
    ...(extractor.query ? (["query"] as const) : []),
    ...(extractor.renderImage ? (["render"] as const) : []),
  ];
}

/** Routing runs here, not in the host process: probes parse untrusted bytes under the worker's limits. */
async function route(file: File, workspace: WorkspaceReader | undefined, signal: AbortSignal): Promise<RouteResult> {
  const resolved = await resolveViewerRegistrations(file, viewerRegistryEntries, { signal, workspace, magicFallback: true });
  const primary = resolved[0];
  if (!primary) throw new AgentError("invalid-file", "No viewer recognizes this file.");
  const pluginId = primary.registration.manifest.id;
  return {
    pluginId,
    formatName: localizeText(primary.registration.manifest.name, "en"),
    supportLevel: primary.supportLevel,
    matchedBy: primary.matchedBy ?? "extension",
    candidates: resolved.map(({ registration, supportLevel }) => ({ pluginId: registration.manifest.id, supportLevel })),
    capabilities: await capabilitiesOf(pluginId),
  };
}

async function handleRequest(req: WorkerRequest): Promise<unknown> {
  const pluginId = req.pluginId ?? "";
  if (!req.filePath || typeof req.size !== "number" || typeof req.mtimeMs !== "number") {
    throw new AgentError("invalid-file", "Missing file metadata for worker request.", { pluginId });
  }

  const controller = new AbortController();
  const name = basename(req.filePath);
  const file = await openDiskFile(req.filePath, name, req.mtimeMs);
  const workspace = workspaceOf(req);
  if (req.op === "route") return route(file, workspace, controller.signal);

  const extractor = await loadExtractor(pluginId);
  const source = new DiskBinarySource(req.filePath, req.size, name);
  try {
    return await runExtractor(req, extractor, {
      source,
      file,
      vendor,
      ...(workspace ? { workspace, relativePath: name } : {}),
      signal: controller.signal,
    });
  } finally {
    source.close();
  }
}

async function runExtractor(req: WorkerRequest, extractor: StructuredExtractor, context: ExtractContext): Promise<unknown> {
  const pluginId = req.pluginId ?? "";
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
