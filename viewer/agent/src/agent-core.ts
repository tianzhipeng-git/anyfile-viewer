import { basename, dirname } from "node:path";
import {
  AgentError,
  localizeText,
  type AgentCapability,
  type InspectPayload,
  type InspectResult,
  type QueryParams,
  type ReadParams,
  type ReadResult,
} from "@anyfile/viewer-protocol";
import { normalizeMaxBytes } from "./budget";
import { createDiskFile } from "./disk-io";
import { hasExtractor } from "./generated/extractors";
import { routeFile } from "./router";
import { createDiskWorkspaceReader, resolveAllowedFile } from "./security";
import { ExtractWorkerPool, type WorkerPoolOptions } from "./worker-pool";

export interface AgentServiceOptions extends WorkerPoolOptions {
  /** Whitelisted directories; all accessed paths must resolve inside one of these roots. */
  readonly allowedRoots: readonly string[];
}

export class AgentService {
  private readonly allowedRoots: readonly string[];
  private readonly pool: ExtractWorkerPool;

  constructor(options: AgentServiceOptions) {
    this.allowedRoots = options.allowedRoots;
    this.pool = new ExtractWorkerPool(options);
  }

  private async resolveAndRoute(inputPath: string, timeoutMs = 10_000) {
    const { realPath, size, mtimeMs } = await resolveAllowedFile(inputPath, this.allowedRoots);
    const file = createDiskFile(realPath, basename(realPath), size, mtimeMs);
    const workspace = createDiskWorkspaceReader(dirname(realPath));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const routed = await routeFile(file, { signal: controller.signal, workspace });
      return { realPath, size, mtimeMs, routed };
    } finally {
      clearTimeout(timer);
    }
  }

  async inspectFile(inputPath: string): Promise<InspectResult> {
    const { realPath, size, mtimeMs, routed } = await this.resolveAndRoute(inputPath);
    const { registration, supportLevel } = routed.primary;
    const pluginId = registration.manifest.id;
    const formatName = localizeText(registration.manifest.name, "en");
    const candidates = routed.candidates.map((c) => ({
      pluginId: c.registration.manifest.id,
      supportLevel: c.supportLevel,
    }));

    if (!hasExtractor(pluginId)) {
      return {
        pluginId,
        formatName,
        supportLevel,
        matchedBy: routed.matchedBy,
        candidates,
        capabilities: [],
        metadata: { fileName: basename(realPath), sizeBytes: size },
        targets: [],
      };
    }

    const capabilities = await this.pool.call<AgentCapability[]>({
      op: "capabilities",
      pluginId,
    });

    const payload = await this.pool.call<InspectPayload>({
      op: "inspect",
      pluginId,
      filePath: realPath,
      size,
      mtimeMs,
      workspaceAccess: registration.manifest.workspaceAccess,
    });

    return {
      pluginId,
      formatName,
      supportLevel,
      matchedBy: routed.matchedBy,
      candidates,
      capabilities,
      ...payload,
    };
  }

  async readFile(
    inputPath: string,
    params: Partial<ReadParams> = {},
  ): Promise<ReadResult & { readonly pluginId: string }> {
    const { realPath, size, mtimeMs, routed } = await this.resolveAndRoute(inputPath);
    const pluginId = routed.primary.registration.manifest.id;
    if (!hasExtractor(pluginId)) {
      throw new AgentError(
        "unsupported-capability",
        `Plugin "${pluginId}" does not support structured read.`,
        { pluginId },
      );
    }

    const result = await this.pool.call<ReadResult>({
      op: "read",
      pluginId,
      filePath: realPath,
      size,
      mtimeMs,
      workspaceAccess: routed.primary.registration.manifest.workspaceAccess,
      readParams: {
        target: params.target,
        cursor: params.cursor,
        filter: params.filter,
        maxBytes: normalizeMaxBytes(params.maxBytes),
      },
    });
    return { ...result, pluginId };
  }

  async queryFile(
    inputPath: string,
    params: { readonly sql: string; readonly target?: string; readonly cursor?: string; readonly maxBytes?: number },
  ): Promise<ReadResult & { readonly pluginId: string }> {
    const { realPath, size, mtimeMs, routed } = await this.resolveAndRoute(inputPath);
    const pluginId = routed.primary.registration.manifest.id;
    if (!hasExtractor(pluginId)) {
      throw new AgentError(
        "unsupported-capability",
        `Plugin "${pluginId}" does not support SQL query.`,
        { pluginId },
      );
    }

    const queryParams: QueryParams = {
      sql: params.sql,
      target: params.target,
      cursor: params.cursor,
      maxBytes: normalizeMaxBytes(params.maxBytes),
    };

    const result = await this.pool.call<ReadResult>({
      op: "query",
      pluginId,
      filePath: realPath,
      size,
      mtimeMs,
      workspaceAccess: routed.primary.registration.manifest.workspaceAccess,
      queryParams,
    });
    return { ...result, pluginId };
  }

  async renderFile(inputPath: string): Promise<never> {
    const { routed } = await this.resolveAndRoute(inputPath);
    const pluginId = routed.primary.registration.manifest.id;
    throw new AgentError(
      "runtime-unavailable",
      `Visual rendering for "${pluginId}" is not yet available in this build.`,
      { pluginId },
    );
  }

  async dispose(): Promise<void> {
    await this.pool.dispose();
  }
}
