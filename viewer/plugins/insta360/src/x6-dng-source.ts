import { ViewerError } from "@anyfile/viewer-protocol";

import { abortError } from "./read-blob";
import type { X6DngWorkerRequest, X6DngWorkerResponse } from "./x6-dng-types";

export function decodeX6DeflateDng(file: File, signal: AbortSignal, failedMessage: string) {
  if (signal.aborted) return Promise.reject(abortError());
  if (typeof Worker !== "function" || typeof DecompressionStream !== "function") {
    return Promise.reject(new ViewerError("unsupported-environment", failedMessage));
  }
  const worker = new Worker(new URL("./x6-dng-worker.ts", import.meta.url), { type: "module" });
  return new Promise<ImageBitmap>((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    worker.addEventListener("error", (event) => {
      cleanup();
      reject(new ViewerError("open-failed", failedMessage, { cause: event.error }));
    }, { once: true });
    worker.addEventListener("message", (event: MessageEvent<X6DngWorkerResponse>) => {
      cleanup();
      if (event.data.type === "error") {
        reject(new ViewerError("invalid-file", failedMessage, { cause: new Error(event.data.message) }));
      } else {
        resolve(event.data.bitmap);
      }
    }, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    const request: X6DngWorkerRequest = { file };
    worker.postMessage(request);
  });
}
