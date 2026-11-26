export {
  createWorkerRpcClient,
  type WorkerRpcClient,
  type WorkerRpcClientOptions,
  type WorkerRpcError,
  type WorkerRpcRequest,
  type WorkerRpcResponse,
  type WorkerRpcSendOptions,
  type WorkerRpcSuccess,
} from "./worker-rpc";

/**
 * Dynamically imports a runtime JS/MJS glue module by URL without bundling it.
 * Centralizes bundler ignore annotations so plugins never repeat them.
 */
export function importRuntime<T = Record<string, unknown>>(url: string): Promise<T> {
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ url) as Promise<T>;
}

export interface RuntimeAttempt<T> {
  initialize(): Promise<T>;
  dispose(): void | Promise<void>;
}

export interface RuntimeSource<T> {
  readonly name: string;
  readonly value: T;
}

function abortError(message: string) {
  return new DOMException(message, "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function initializeRuntimeFromSources<TSource, TResult>(options: {
  readonly signal: AbortSignal;
  readonly sources: readonly RuntimeSource<TSource>[];
  readonly createAttempt: (source: RuntimeSource<TSource>) => Promise<RuntimeAttempt<TResult>>;
  readonly errorMessage: string;
  readonly abortMessage?: string;
}): Promise<TResult> {
  const errors: unknown[] = [];
  const abortMessage = options.abortMessage ?? "Runtime initialization aborted.";

  for (const source of options.sources) {
    if (options.signal.aborted) throw abortError(abortMessage);
    let attempt: RuntimeAttempt<TResult> | undefined;
    try {
      attempt = await options.createAttempt(source);
      return await attempt.initialize();
    } catch (error) {
      await attempt?.dispose();
      if (options.signal.aborted || isAbortError(error)) throw abortError(abortMessage);
      errors.push(error);
    }
  }

  throw new AggregateError(errors, options.errorMessage);
}
