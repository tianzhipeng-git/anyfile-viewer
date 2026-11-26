import { dirname } from "node:path";
import {
  AgentError,
  type InspectPayload,
  type InspectResult,
  type QueryParams,
  type ReadParams,
  type ReadResult,
} from "@anyfile/viewer-protocol";
import { normalizeMaxBytes } from "./budget";
import { isWithinAllowedRoots, resolveAllowedFile } from "./security";
import type { RouteResult, WorkerRequest } from "./worker";
import { ExtractWorkerPool, type WorkerPoolOptions } from "./worker-pool";

export interface AgentServiceOptions extends WorkerPoolOptions {
  /** Whitelisted directories; all accessed paths must resolve inside one of these roots. */
  readonly allowedRoots: readonly string[];
}

type FileRequest = Pick<WorkerRequest, "filePath" | "size" | "mtimeMs" | "workspaceRoot">;

export class AgentService {
  private readonly allowedRoots: readonly string[];
  private readonly pool: ExtractWorkerPool;

  constructor(options: AgentServiceOptions) {
    this.allowedRoots = options.allowedRoots;
    this.pool = new ExtractWorkerPool(options);
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
    return { ...route, ...payload };
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

  async dispose(): Promise<void> {
    await this.pool.dispose();
  }
}
