import { dirname } from "node:path";
import {
  AgentError,
  DEFAULT_INSPECT_MAX_BYTES,
  type InspectPayload,
  type InspectResult,
  type QueryParams,
  type ReadParams,
  type ReadResult,
} from "@anyfile/viewer-protocol";
import { normalizeMaxBytes, trimInspectPayload } from "./budget";
import { ChromiumRenderer } from "./chromium-renderer";
import { normalizeMaxDimension } from "./png";
import { isWithinAllowedRoots, resolveAllowedFile } from "./security";
import type { RouteResult, WorkerRequest } from "./worker";
import { DEFAULT_RENDER_TIMEOUT_MS, ExtractWorkerPool, type WorkerPoolOptions } from "./worker-pool";

export interface AgentServiceOptions extends WorkerPoolOptions {
  /** Whitelisted directories; all accessed paths must resolve inside one of these roots. */
  readonly allowedRoots: readonly string[];
  /** Optional override for the built renderer-host static directory. */
  readonly rendererHostDir?: string;
}

export interface RenderParams {
  readonly target?: string;
  readonly maxDimension?: number;
}

export interface RenderResult {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly pluginId: string;
  readonly engine: "node-pixel" | "chromium";
  readonly targetIgnored?: boolean;
}

type FileRequest = Pick<WorkerRequest, "filePath" | "size" | "mtimeMs" | "workspaceRoot">;

export class AgentService {
  private readonly allowedRoots: readonly string[];
  private readonly pool: ExtractWorkerPool;
  private readonly chromium: ChromiumRenderer;

  constructor(options: AgentServiceOptions) {
    this.allowedRoots = options.allowedRoots;
    this.pool = new ExtractWorkerPool(options);
    this.chromium = new ChromiumRenderer({
      persistent: options.persistent,
      idleTimeoutMs: options.idleTimeoutMs,
      rendererHostDir: options.rendererHostDir,
    });
  }

  /** Checks the path against the allow-list, then routes it inside the worker. */
  private async open(inputPath: string): Promise<{ readonly file: FileRequest; readonly route: RouteResult }> {
    const { realPath, size, mtimeMs } = await resolveAllowedFile(inputPath, this.allowedRoots);
    const parent = dirname(realPath);
    const file: FileRequest = {
      filePath: realPath,
      size,
      mtimeMs,
      ...((await isWithinAllowedRoots(parent, this.allowedRoots)) ? { workspaceRoot: parent } : {}),
    };
    return { file, route: await this.pool.call<RouteResult>({ op: "route", ...file }) };
  }

  private async extractable(inputPath: string, capability: "read" | "query") {
    const opened = await this.open(inputPath);
    const { pluginId, capabilities } = opened.route;
    if (!capabilities.includes(capability)) {
      throw new AgentError("unsupported-capability", `Plugin "${pluginId}" does not support ${capability}.`, { pluginId });
    }
    return opened;
  }

  async inspectFile(inputPath: string): Promise<InspectResult> {
    const { file, route } = await this.open(inputPath);
    const payload: InspectPayload = route.capabilities.length
      ? await this.pool.call<InspectPayload>({ op: "inspect", pluginId: route.pluginId, ...file })
      : { metadata: { sizeBytes: file.size ?? 0 }, targets: [] };
    const routeOverhead = Buffer.byteLength(JSON.stringify(route), "utf8");
    const bounded = trimInspectPayload(payload, Math.max(64, DEFAULT_INSPECT_MAX_BYTES - routeOverhead));
    return { ...route, ...bounded };
  }

  async readFile(inputPath: string, params: Partial<ReadParams> = {}): Promise<ReadResult & { readonly pluginId: string }> {
    const { file, route } = await this.extractable(inputPath, "read");
    const readParams: ReadParams = { ...params, maxBytes: normalizeMaxBytes(params.maxBytes) };
    const result = await this.pool.call<ReadResult>({ op: "read", pluginId: route.pluginId, ...file, readParams });
    return { ...result, pluginId: route.pluginId };
  }

  async queryFile(
    inputPath: string,
    params: Omit<QueryParams, "maxBytes"> & { readonly maxBytes?: number },
  ): Promise<ReadResult & { readonly pluginId: string }> {
    const { file, route } = await this.extractable(inputPath, "query");
    const queryParams: QueryParams = { ...params, maxBytes: normalizeMaxBytes(params.maxBytes) };
    const result = await this.pool.call<ReadResult>({ op: "query", pluginId: route.pluginId, ...file, queryParams });
    return { ...result, pluginId: route.pluginId };
  }

  async renderFile(inputPath: string, params: RenderParams = {}): Promise<RenderResult> {
    const { file, route } = await this.open(inputPath);
    const maxDimension = normalizeMaxDimension(params.maxDimension);

    if (route.capabilities.includes("render")) {
      const rendered = await this.pool.call<{ readonly png: Uint8Array; readonly width: number; readonly height: number }>(
        {
          op: "render",
          pluginId: route.pluginId,
          ...file,
          renderParams: { target: params.target, maxDimension },
        },
        { timeoutMs: DEFAULT_RENDER_TIMEOUT_MS },
      );
      return {
        png: rendered.png instanceof Uint8Array ? rendered.png : new Uint8Array(rendered.png),
        width: rendered.width,
        height: rendered.height,
        pluginId: route.pluginId,
        engine: "node-pixel",
      };
    }

    const rendered = await this.chromium.render({
      pluginId: route.pluginId,
      filePath: file.filePath!,
      size: file.size ?? 0,
      mtimeMs: file.mtimeMs ?? 0,
      workspaceRoot: file.workspaceRoot,
      target: params.target,
      maxDimension,
    });
    return {
      ...rendered,
      pluginId: route.pluginId,
      engine: "chromium",
    };
  }

  async dispose(): Promise<void> {
    await Promise.all([this.pool.dispose(), this.chromium.dispose()]);
  }
}
