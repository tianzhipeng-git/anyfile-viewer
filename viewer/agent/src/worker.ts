import dgram from "node:dgram";
import net from "node:net";
import { parentPort, workerData } from "node:worker_threads";
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
  type VendorAssets,
  type WorkspaceReader,
} from "@anyfile/viewer-protocol";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { normalizeMaxBytes, toAgentFileError, trimInspectPayload, trimReadResult } from "./budget";
import { DiskBinarySource, openDiskFile } from "./disk-io";
import { extractorLoaders } from "./generated/extractors";
import { encodePng, normalizeMaxDimension, readPngDimensions } from "./png";
import { createDiskWorkspaceReader } from "./security";
import { loadDefaultVendorManifest } from "./vendor-manifest";

export interface WorkerInitData {
  readonly vendorRoots?: readonly string[];
  readonly vendorManifest?: Readonly<Record<string, string>>;
}

export interface WorkerRequest {
  readonly id: number;
  readonly op: "route" | "inspect" | "read" | "query" | "render" | "cancel";
  readonly pluginId?: string;
  readonly filePath?: string;
  readonly size?: number;
  readonly mtimeMs?: number;
  /** Directory sibling files may be read from; omitted when it lies outside the allowed roots. */
  readonly workspaceRoot?: string;
  readonly readParams?: ReadParams;
  readonly queryParams?: QueryParams;
  readonly renderParams?: { readonly target?: string; readonly maxDimension?: number };
}

export interface WorkerVendorEnsureResult {
  readonly op: "vendor-ensure-result";
  readonly ensureId: number;
  readonly ok: boolean;
  readonly error?: AgentFileError;
}

export type HostToWorkerMessage = WorkerRequest | WorkerVendorEnsureResult;

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

export interface WorkerVendorEnsureRequest {
  readonly type: "vendor-ensure";
  readonly ensureId: number;
  readonly path: string;
}

export type WorkerOutboundMessage = WorkerResponse | WorkerVendorEnsureRequest;

const initData = (workerData ?? null) as WorkerInitData | null;
const vendorManifest = initData?.vendorManifest ?? loadDefaultVendorManifest();
const localVendor = createNodeVendorAssets(initData?.vendorRoots, vendorManifest);
const pendingVendorEnsures = new Map<number, { readonly resolve: () => void; readonly reject: (error: unknown) => void }>();
const inflightVendorEnsures = new Map<string, Promise<void>>();
let nextVendorEnsureId = 1;

function requestHostVendorAsset(path: string): Promise<void> {
  if (!parentPort || !vendorManifest[path]) {
    return Promise.reject(new AgentError("runtime-unavailable", `Runtime asset /vendor/${path} is not available locally.`));
  }
  const existing = inflightVendorEnsures.get(path);
  if (existing) return existing;
  const ensureId = nextVendorEnsureId++;
  const promise = new Promise<void>((resolve, reject) => {
    pendingVendorEnsures.set(ensureId, { resolve, reject });
    parentPort!.postMessage({ type: "vendor-ensure", ensureId, path } satisfies WorkerVendorEnsureRequest);
  }).finally(() => {
    inflightVendorEnsures.delete(path);
  });
  inflightVendorEnsures.set(path, promise);
  return promise;
}

async function withOnDemandVendor<T>(path: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    const message = error instanceof Error ? error.message : "";
    if (code !== "runtime-unavailable" || !message.includes("not available locally") || !parentPort || !vendorManifest[path]) {
      throw error;
    }
    await requestHostVendorAsset(path);
    return load();
  }
}

const vendor: VendorAssets = {
  bytes: (path) => withOnDemandVendor(path, () => localVendor.bytes(path)),
  url: (path) => withOnDemandVendor(path, () => localVendor.url(path)),
};
const extractorCache = new Map<string, Promise<StructuredExtractor>>();
const activeControllers = new Map<number, AbortController>();

function blockedNetworkError(): AgentError {
  return new AgentError("runtime-unavailable", "Network access is disabled inside the extraction worker.");
}

/** Blocks outbound network APIs inside the worker thread so untrusted files cannot trigger network I/O. */
export function installWorkerNetworkGuard(): void {
  globalThis.fetch = async () => {
    throw blockedNetworkError();
  };
  if ("WebSocket" in globalThis) {
    (globalThis as Record<string, unknown>).WebSocket = class BlockedWebSocket {
      constructor() {
        throw blockedNetworkError();
      }
    };
  }
  net.Socket.prototype.connect = function blockedConnect() {
    throw blockedNetworkError();
  };
  dgram.createSocket = (() => {
    throw blockedNetworkError();
  }) as typeof dgram.createSocket;
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
    cached = loader().catch((error: unknown) => {
      extractorCache.delete(pluginId);
      throw error;
    });
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
    throw new AgentError("invalid-argument", "Missing file metadata for worker request.", { pluginId });
  }

  const controller = new AbortController();
  activeControllers.set(req.id, controller);
  try {
    const name = basename(req.filePath);
    const file = await openDiskFile(req.filePath, name, req.mtimeMs);
    const workspace = workspaceOf(req);
    if (req.op === "route") return await route(file, workspace, controller.signal);

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
  } finally {
    activeControllers.delete(req.id);
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

  if (req.op === "render") {
    if (typeof extractor.renderImage !== "function") {
      throw new AgentError(
        "unsupported-capability",
        `Plugin "${pluginId}" does not support pure-pixel rendering.`,
        { pluginId },
      );
    }
    const maxDimension = normalizeMaxDimension(req.renderParams?.maxDimension);
    const rgba = await extractor.renderImage(context, {
      target: req.renderParams?.target,
      maxDimension,
    });
    const png = encodePng(rgba, maxDimension);
    const { width, height } = readPngDimensions(png);
    return { png, width, height };
  }

  throw new AgentError("unsupported-capability", `Unknown worker operation: ${String(req.op)}`, { pluginId });
}

if (parentPort) {
  installWorkerNetworkGuard();
  const port = parentPort;
  port.on("message", async (msg: HostToWorkerMessage) => {
    if (msg.op === "vendor-ensure-result") {
      const entry = pendingVendorEnsures.get(msg.ensureId);
      if (!entry) return;
      pendingVendorEnsures.delete(msg.ensureId);
      if (msg.ok) {
        entry.resolve();
      } else {
        entry.reject(
          new AgentError(
            msg.error?.code ?? "runtime-unavailable",
            msg.error?.message ?? "Failed to fetch required /vendor/ runtime asset.",
            { pluginId: msg.error?.pluginId },
          ),
        );
      }
      return;
    }
    if (msg.op === "cancel") {
      activeControllers.get(msg.id)?.abort();
      return;
    }
    try {
      const result = await handleRequest(msg);
      const response: WorkerResponse = { id: msg.id, ok: true, result };
      port.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = {
        id: msg.id,
        ok: false,
        error: toAgentFileError(error, msg.pluginId),
      };
      port.postMessage(response);
    }
  });
}
