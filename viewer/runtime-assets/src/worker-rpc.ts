import { ViewerError } from "@anyfile/viewer-protocol";

export interface WorkerRpcRequest {
  readonly id: number;
  readonly type: string;
}

export interface WorkerRpcSuccess {
  readonly id: number;
  readonly type: string;
}

export interface WorkerRpcError {
  readonly id: number;
  readonly type: "error";
  readonly code: ConstructorParameters<typeof ViewerError>[0];
  readonly message: string;
}

export type WorkerRpcResponse = WorkerRpcSuccess | WorkerRpcError;

export interface WorkerRpcClientOptions<TRequest extends WorkerRpcRequest, TResponse extends WorkerRpcResponse> {
  /** Terminating this signal cancels every pending request and terminates the worker. */
  readonly signal: AbortSignal;
  /** Whether a response's id matters. Defaults to `true`; set `false` when a worker never echoes ids. */
  readonly expectId?: boolean;
  /** Default timeout in ms applied to a request that does not supply its own. */
  readonly defaultTimeoutMs?: number;
  /** Error code/message used when the worker times out. */
  readonly timeoutError?: (request: TRequest) => { code: ConstructorParameters<typeof ViewerError>[0]; message: string };
  /** Error reported when the worker emits an `error` event or `postMessage` throws. */
  readonly workerError?: (request: TRequest, cause: unknown) => { code: ConstructorParameters<typeof ViewerError>[0]; message: string };
  /** Error reported when a response of an unexpected type is received. */
  readonly unexpectedResponse?: (response: Exclude<TResponse, { type: "error" }>) => { code: ConstructorParameters<typeof ViewerError>[0]; message: string };
}

export interface WorkerRpcSendOptions<TType extends string = string> {
  readonly expectedType: TType;
  readonly transfer?: Transferable[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface WorkerRpcClient<TRequest extends WorkerRpcRequest, TResponse extends WorkerRpcResponse> {
  /** Post a request and resolve with the first response carrying the same id and expected type. */
  send<T extends TResponse["type"]>(
    request: TRequest,
    options: WorkerRpcSendOptions<T>,
  ): Promise<Extract<TResponse, { type: T }>>;
  readonly disposed: boolean;
  readonly dispose: () => void;
}

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

function defaultTimeoutError<TRequest extends WorkerRpcRequest>(request: TRequest) {
  return {
    code: request.type === "init" ? ("unsupported-environment" as const) : ("resource-limit" as const),
    message: `${request.type}: worker operation timed out.`,
  };
}

export function createWorkerRpcClient<TRequest extends WorkerRpcRequest, TResponse extends WorkerRpcResponse>(
  worker: Worker,
  options: WorkerRpcClientOptions<TRequest, TResponse>,
): WorkerRpcClient<TRequest, TResponse> {
  const expectId = options.expectId ?? true;
  const timeoutError = options.timeoutError ?? defaultTimeoutError;
  const workerError = options.workerError ?? ((request: TRequest) => ({ code: "open-failed" as const, message: `${request.type}: worker failed.` }));
  const cancellations = new Set<() => void>();
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    options.signal.removeEventListener("abort", dispose);
    for (const cancel of [...cancellations]) cancel();
    worker.terminate();
  };

  options.signal.addEventListener("abort", dispose, { once: true });

  function send<T extends TResponse["type"]>(request: TRequest, sendOptions: WorkerRpcSendOptions): Promise<Extract<TResponse, { type: T }>> {
    const callSignal = sendOptions.signal;
    if (disposed || options.signal.aborted || callSignal?.aborted) return Promise.reject(abortError());
    const transfer = sendOptions.transfer ?? [];
    const timeoutMs = sendOptions.timeoutMs ?? options.defaultTimeoutMs;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        if (timeout !== undefined) clearTimeout(timeout);
        cancellations.delete(cancel);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onWorkerError);
        options.signal.removeEventListener("abort", onAbort);
        callSignal?.removeEventListener("abort", onCallAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(abortError());
      };
      const onCallAbort = () => {
        cleanup();
        reject(abortError());
      };
      const onWorkerError = (event: ErrorEvent) => {
        cleanup();
        dispose();
        const { code, message } = workerError(request, event);
        reject(new ViewerError(code, message));
      };
      const onMessage = (event: MessageEvent<TResponse>) => {
        const data = event.data;
        if (expectId && (data as { id?: number }).id !== request.id) return;
        cleanup();
        if (data.type === sendOptions.expectedType) {
          resolve(data as Extract<TResponse, { type: T }>);
        } else if (data.type === "error") {
          const error = data as unknown as WorkerRpcError;
          reject(new ViewerError(error.code, error.message));
        } else {
          const { code, message } = options.unexpectedResponse?.(data as Exclude<TResponse, { type: "error" }>) ?? {
            code: "open-failed" as const,
            message: `${request.type}: unexpected response.`,
          };
          reject(new ViewerError(code, message));
        }
      };
      let timeout: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs !== undefined) {
        timeout = setTimeout(() => {
          cleanup();
          dispose();
          const { code, message } = timeoutError(request);
          reject(new ViewerError(code, message));
        }, timeoutMs);
      }
      const cancel = () => {
        cleanup();
        reject(abortError());
      };
      cancellations.add(cancel);
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onWorkerError);
      options.signal.addEventListener("abort", onAbort, { once: true });
      callSignal?.addEventListener("abort", onCallAbort, { once: true });
      try {
        worker.postMessage(request, transfer);
      } catch (error) {
        cleanup();
        const { code, message } = workerError(request, error);
        reject(new ViewerError(code, message));
      }
    });
  }

  return {
    send,
    get disposed() {
      return disposed;
    },
    dispose,
  };
}
