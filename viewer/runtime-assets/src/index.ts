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

export const LOCAL_ORIGIN_FIRST_GLOBAL = "__ANYFILE_LOCAL_ORIGIN_FIRST__";

interface LocalOriginFirstGlobal {
  [LOCAL_ORIGIN_FIRST_GLOBAL]?: boolean;
}

export function isLocalOriginFirst(): boolean {
  return Boolean((globalThis as LocalOriginFirstGlobal)[LOCAL_ORIGIN_FIRST_GLOBAL]);
}

export function setLocalOriginFirst(enabled: boolean): void {
  (globalThis as LocalOriginFirstGlobal)[LOCAL_ORIGIN_FIRST_GLOBAL] = enabled;
}

function isLocalSource(source: RuntimeSource<unknown>): boolean {
  const normalizedName = source.name.trim().toLowerCase();
  if (normalizedName === "local" || normalizedName === "same-origin") {
    return true;
  }
  return typeof source.value === "string" && source.value.startsWith("/") && !source.value.startsWith("//");
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
  const localSources = isLocalOriginFirst() ? options.sources.filter(isLocalSource) : [];
  const orderedSources = localSources.length > 0 ? localSources : options.sources;

  for (const source of orderedSources) {
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
