import { initializeRuntimeFromSources } from "@anyfile/runtime-assets";
import { ViewerError } from "@anyfile/viewer-protocol";
import { OCCT_ASSET_SOURCES } from "./runtime";
import type { CadData, CadWorkerRequest, CadWorkerResponse } from "./types";

interface Messages { invalid: string; limit: string; unsupported: string }
const abortError = () => new DOMException("Aborted", "AbortError");

class CadWorkerClient {
  private readonly worker = new Worker(new URL("./kernel.worker.ts", import.meta.url), { type: "module" });
  private disposed = false;
  private cancel?: () => void;

  constructor(private readonly signal: AbortSignal, private readonly copy: Messages) {
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  async initialize(runtimeUrl: string) {
    const response = await this.request({ type: "init", runtimeUrl: new URL(runtimeUrl, location.origin).href });
    if (response.type !== "ready") throw new ViewerError("unsupported-environment", this.copy.unsupported);
  }

  async open(bytes: ArrayBuffer, format: string): Promise<CadData> {
    const response = await this.request({ type: "open", bytes, format }, [bytes]);
    if (response.type !== "opened") throw new ViewerError("open-failed", this.copy.invalid);
    return response.result;
  }

  private request(request: CadWorkerRequest, transfer: Transferable[] = []): Promise<CadWorkerResponse> {
    if (this.disposed || this.signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.cancel = undefined;
      };
      const fail = (error: Error) => { cleanup(); reject(error); };
      const timeout = request.type === "init" ? setTimeout(() => {
        fail(new ViewerError("unsupported-environment", this.copy.unsupported));
      }, 20_000) : undefined;
      this.cancel = () => fail(abortError());
      this.worker.onerror = () => fail(new ViewerError("open-failed", this.copy.invalid));
      this.worker.onmessage = ({ data }: MessageEvent<CadWorkerResponse>) => {
        cleanup();
        if (data.type === "error") {
          reject(new ViewerError(data.code, data.code === "resource-limit" ? this.copy.limit : data.code === "unsupported-environment" ? this.copy.unsupported : this.copy.invalid));
        } else resolve(data);
      };
      try { this.worker.postMessage(request, transfer); }
      catch (error) { cleanup(); reject(error); }
    });
  }

  readonly dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.signal.removeEventListener("abort", this.dispose);
    this.cancel?.();
    this.worker.terminate();
  };
}

export async function createCadWorkerClient(signal: AbortSignal, copy: Messages) {
  try {
    return await initializeRuntimeFromSources({
      signal,
      sources: OCCT_ASSET_SOURCES,
      errorMessage: copy.unsupported,
      async createAttempt(source) {
        const client = new CadWorkerClient(signal, copy);
        return {
          async initialize() { await client.initialize(source.value); return client; },
          dispose() { client.dispose(); },
        };
      },
    });
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw abortError();
    throw new ViewerError("unsupported-environment", copy.unsupported, { cause: error });
  }
}
