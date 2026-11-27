import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { AgentError } from "@anyfile/viewer-protocol";
import { toAgentFileError } from "./budget";
import { VendorAssetStore, type VendorAssetStoreOptions } from "./vendor-store";
import type {
  WorkerInitData,
  WorkerOutboundMessage,
  WorkerRequest,
  WorkerVendorEnsureRequest,
  WorkerVendorEnsureResult,
} from "./worker";

export interface WorkerPoolOptions extends VendorAssetStoreOptions {
  /** Keep worker alive across requests for MCP module/WASM reuse. Default: false (CLI ephemeral). */
  readonly persistent?: boolean;
  /** Default wall-clock timeout per call in ms. Default: 10_000. */
  readonly defaultTimeoutMs?: number;
  /** Max old-generation heap in MiB for the worker isolate. Default: 512. */
  readonly maxOldGenerationSizeMb?: number;
  /** Idle timeout in ms before closing a persistent worker. Default: 5 minutes. */
  readonly idleTimeoutMs?: number;
}

const IS_TS_RUNTIME = import.meta.url.endsWith(".ts");
const WORKER_URL = (() => {
  if (IS_TS_RUNTIME) return new URL("./worker.ts", import.meta.url);
  const sibling = new URL("./worker.mjs", import.meta.url);
  if (existsSync(fileURLToPath(sibling))) return sibling;
  return new URL("../worker.mjs", import.meta.url);
})();
const TS_HOOKS_URL = new URL("./ts-hooks.mjs", import.meta.url);
export const DEFAULT_RENDER_TIMEOUT_MS = 20_000;

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
  remainingMs: number;
  startedAt: number;
  readonly onTimeout: () => void;
  readonly cleanup?: () => void;
  readonly worker: Worker;
  readonly pluginId?: string;
}

export class ExtractWorkerPool {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeVendorEnsures = 0;
  private vendorStore: VendorAssetStore | null = null;
  private readonly vendorOptions: VendorAssetStoreOptions;
  private readonly persistent: boolean;
  private readonly defaultTimeoutMs: number;
  private readonly maxOldGenerationSizeMb: number;
  private readonly idleTimeoutMs: number;

  constructor(options: WorkerPoolOptions = {}) {
    this.persistent = options.persistent ?? false;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.maxOldGenerationSizeMb = options.maxOldGenerationSizeMb ?? 512;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60 * 1000;
    this.vendorOptions = {
      vendorRoots: options.vendorRoots,
      vendorCacheRoot: options.vendorCacheRoot,
      vendorManifest: options.vendorManifest,
      vendorUpstreamBaseUrl: options.vendorUpstreamBaseUrl,
    };
  }

  private getVendorStore(): VendorAssetStore {
    this.vendorStore ??= new VendorAssetStore(this.vendorOptions);
    return this.vendorStore;
  }

  private pausePendingTimers(): void {
    const now = Date.now();
    for (const entry of this.pending.values()) {
      if (entry.timer !== null) {
        clearTimeout(entry.timer);
        entry.timer = null;
        entry.remainingMs = Math.max(100, entry.remainingMs - (now - entry.startedAt));
      }
    }
  }

  private resumePendingTimers(): void {
    if (this.activeVendorEnsures > 0) return;
    const now = Date.now();
    for (const entry of this.pending.values()) {
      if (entry.timer === null) {
        entry.startedAt = now;
        entry.timer = setTimeout(entry.onTimeout, entry.remainingMs);
      }
    }
  }

  private handleVendorEnsure(worker: Worker, msg: WorkerVendorEnsureRequest): void {
    this.activeVendorEnsures += 1;
    if (this.activeVendorEnsures === 1) {
      this.pausePendingTimers();
    }
    void this.getVendorStore()
      .ensureCached(msg.path)
      .then(
        () => {
          const reply: WorkerVendorEnsureResult = { op: "vendor-ensure-result", ensureId: msg.ensureId, ok: true };
          try {
            worker.postMessage(reply);
          } catch {
            // Worker already exited.
          }
        },
        (error: unknown) => {
          const reply: WorkerVendorEnsureResult = {
            op: "vendor-ensure-result",
            ensureId: msg.ensureId,
            ok: false,
            error: toAgentFileError(error),
          };
          try {
            worker.postMessage(reply);
          } catch {
            // Worker already exited.
          }
        },
      )
      .finally(() => {
        this.activeVendorEnsures = Math.max(0, this.activeVendorEnsures - 1);
        this.resumePendingTimers();
      });
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleIdleShutdown(): void {
    this.clearIdleTimer();
    if (!this.persistent || !this.worker || this.pending.size > 0) return;
    this.idleTimer = setTimeout(() => {
      void this.dispose();
    }, this.idleTimeoutMs);
    this.idleTimer.unref();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const resolvedVendorRoots =
      this.vendorOptions.vendorRoots ??
      (this.vendorOptions.vendorCacheRoot ? [this.vendorOptions.vendorCacheRoot] : undefined);
    const workerData: WorkerInitData | undefined =
      resolvedVendorRoots || this.vendorOptions.vendorManifest
        ? {
            ...(resolvedVendorRoots ? { vendorRoots: resolvedVendorRoots } : {}),
            ...(this.vendorOptions.vendorManifest ? { vendorManifest: this.vendorOptions.vendorManifest } : {}),
          }
        : undefined;
    const worker = new Worker(WORKER_URL, {
      execArgv: IS_TS_RUNTIME ? ["--import", TS_HOOKS_URL.href] : [],
      // Always an object: some libraries (geotiff's `web-worker`) read `workerData` fields at import time.
      workerData: workerData ?? {},
      stdout: true,
      stderr: true,
      resourceLimits: {
        maxOldGenerationSizeMb: this.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: 128,
      },
    });
    // Drain captured worker stdio so chatty WASM/extractors never backpressure or corrupt parent stdout (MCP/CLI).
    worker.stdout?.resume();
    worker.stderr?.resume();
    worker.unref();

    worker.on("message", (msg: WorkerOutboundMessage) => {
      if ("type" in msg) {
        this.handleVendorEnsure(worker, msg);
        return;
      }
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (entry.timer !== null) clearTimeout(entry.timer);
      entry.cleanup?.();
      if (msg.ok) {
        entry.resolve(msg.result);
      } else {
        const err = msg.error;
        entry.reject(
          new AgentError(err?.code ?? "invalid-file", err?.message ?? "Worker execution failed.", {
            pluginId: err?.pluginId ?? entry.pluginId,
          }),
        );
      }
      this.scheduleIdleShutdown();
    });

    worker.on("error", (error) => {
      const outOfMemory = (error as { code?: unknown }).code === "ERR_WORKER_OUT_OF_MEMORY";
      if (this.worker === worker) this.worker = null;
      this.failPending(
        worker,
        new AgentError(
          outOfMemory ? "resource-limit" : "runtime-unavailable",
          error.message || "Worker terminated unexpectedly.",
        ),
      );
    });

    worker.on("exit", (exitCode) => {
      if (this.worker === worker) this.worker = null;
      this.failPending(
        worker,
        new AgentError("runtime-unavailable", `Worker exited unexpectedly (code ${exitCode}).`),
      );
    });

    this.worker = worker;
    return worker;
  }

  /** Rejects calls owned by `worker` (or every call when omitted); calls on a newer worker are untouched. */
  private failPending(worker: Worker | null, error: AgentError): void {
    for (const [id, entry] of this.pending) {
      if (worker && entry.worker !== worker) continue;
      if (entry.timer !== null) clearTimeout(entry.timer);
      entry.cleanup?.();
      entry.reject(error);
      this.pending.delete(id);
    }
  }

  async call<T>(
    request: Omit<WorkerRequest, "id">,
    options?: { readonly timeoutMs?: number; readonly signal?: AbortSignal },
  ): Promise<T> {
    if (options?.signal?.aborted) {
      throw new AgentError("timeout", "Operation was cancelled.", { pluginId: request.pluginId });
    }
    this.clearIdleTimer();
    const worker = this.ensureWorker();
    const id = this.nextId++;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        if (entry.timer !== null) clearTimeout(entry.timer);
        entry.cleanup?.();
        try {
          worker.postMessage({ id, op: "cancel" } satisfies WorkerRequest);
        } catch {
          // Worker may already be terminating.
        }
        reject(new AgentError("timeout", "Operation was cancelled.", { pluginId: request.pluginId }));
      };
      const cleanup = options?.signal
        ? () => options.signal?.removeEventListener("abort", onAbort)
        : undefined;
      options?.signal?.addEventListener("abort", onAbort, { once: true });

      const onTimeout = () => {
        this.pending.delete(id);
        cleanup?.();
        if (this.worker === worker) this.worker = null;
        void worker.terminate();
        reject(
          new AgentError("timeout", `Operation timed out after ${timeoutMs}ms.`, {
            pluginId: request.pluginId,
          }),
        );
      };

      const startedAt = Date.now();
      const timer = this.activeVendorEnsures > 0 ? null : setTimeout(onTimeout, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        remainingMs: timeoutMs,
        startedAt,
        onTimeout,
        cleanup,
        worker,
        pluginId: request.pluginId,
      });

      worker.postMessage({ ...request, id } satisfies WorkerRequest);
    });
  }

  async dispose(): Promise<void> {
    this.clearIdleTimer();
    const worker = this.worker;
    this.worker = null;
    this.failPending(null, new AgentError("runtime-unavailable", "Worker pool disposed."));
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // Ignore termination errors.
      }
    }
  }
}
