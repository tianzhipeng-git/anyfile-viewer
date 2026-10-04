import { initializeRuntimeFromSources } from "@anyfile/runtime-assets";
import { ViewerError } from "@anyfile/viewer-protocol";
import { IFC_ASSET_SOURCES } from "./runtime";
import type { IfcData, IfcWorkerRequest, IfcWorkerResponse } from "./types";

interface Messages { invalid: string; limit: string; unsupported: string }
const abortError = () => new DOMException("Aborted", "AbortError");

class IfcWorkerClient {
  private readonly worker = new Worker(new URL("./ifc.worker.ts", import.meta.url), { type: "module" });
  private disposed = false;
  private cancel?: () => void;

  constructor(private readonly signal: AbortSignal, private readonly copy: Messages) {
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  async initialize(runtimeUrl: string) {
    const response = await this.request({ type: "init", runtimeUrl: new URL(runtimeUrl, location.origin).href });
    if (response.type !== "ready") throw new ViewerError("unsupported-environment", this.copy.unsupported);
  }

  async open(bytes: ArrayBuffer): Promise<IfcData> {
    const response = await this.request({ type: "open", bytes }, [bytes]);
    if (response.type !== "opened") throw new ViewerError("open-failed", this.copy.invalid);
    return response.result;
  }

  private request(request: IfcWorkerRequest, transfer: Transferable[] = []): Promise<IfcWorkerResponse> {
    if (this.disposed || this.signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.cancel = undefined;
      };
      const fail = (error: Error) => { cleanup(); reject(error); };
      const timeout = setTimeout(() => {
        fail(new ViewerError(request.type === "init" ? "unsupported-environment" : "resource-limit", request.type === "init" ? this.copy.unsupported : this.copy.limit));
      }, request.type === "init" ? 20_000 : 120_000);
      this.cancel = () => fail(abortError());
      this.worker.onerror = () => fail(new ViewerError("open-failed", this.copy.invalid));
      this.worker.onmessage = ({ data }: MessageEvent<IfcWorkerResponse>) => {
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

export async function createIfcWorkerClient(signal: AbortSignal, copy: Messages) {
  try {
    return await initializeRuntimeFromSources({
      signal,
      sources: IFC_ASSET_SOURCES,
      errorMessage: copy.unsupported,
      async createAttempt(source) {
        const client = new IfcWorkerClient(signal, copy);
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
