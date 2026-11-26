import { Worker } from "node:worker_threads";
import { AgentError } from "@anyfile/viewer-protocol";
import type { WorkerRequest, WorkerResponse } from "./worker";

export interface WorkerPoolOptions {
  /** Keep worker alive across requests for MCP LRU session caching. Default: false (CLI ephemeral). */
  readonly persistent?: boolean;
  /** Default wall-clock timeout per call in ms. Default: 10_000. */
  readonly defaultTimeoutMs?: number;
  /** Max old-generation heap in MiB for the worker isolate. Default: 512. */
  readonly maxOldGenerationSizeMb?: number;
  /** Idle timeout in ms before closing a persistent worker. Default: 5 minutes. */
  readonly idleTimeoutMs?: number;
}

const WORKER_URL = new URL("./worker.ts", import.meta.url);
const TS_HOOKS_URL = new URL("./ts-hooks.mjs", import.meta.url);

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly worker: Worker;
  readonly pluginId?: string;
}

export class ExtractWorkerPool {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly persistent: boolean;
  private readonly defaultTimeoutMs: number;
  private readonly maxOldGenerationSizeMb: number;
  private readonly idleTimeoutMs: number;

  constructor(options: WorkerPoolOptions = {}) {
    this.persistent = options.persistent ?? false;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.maxOldGenerationSizeMb = options.maxOldGenerationSizeMb ?? 512;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60 * 1000;
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
    const worker = new Worker(WORKER_URL, {
      execArgv: ["--import", TS_HOOKS_URL.href],
      resourceLimits: {
        maxOldGenerationSizeMb: this.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: 128,
      },
    });
    worker.unref();

    worker.on("message", (msg: WorkerResponse) => {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      clearTimeout(entry.timer);
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
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }

  async call<T>(
    request: Omit<WorkerRequest, "id">,
    options?: { readonly timeoutMs?: number },
  ): Promise<T> {
    this.clearIdleTimer();
    const worker = this.ensureWorker();
    const id = this.nextId++;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (this.worker === worker) this.worker = null;
        void worker.terminate();
        reject(
          new AgentError("timeout", `Operation timed out after ${timeoutMs}ms.`, {
            pluginId: request.pluginId,
          }),
        );
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
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
