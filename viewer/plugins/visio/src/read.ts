export function readBlob(blob: Blob, signal: AbortSignal): Promise<ArrayBuffer> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    reader.onload = () => { const bytes = reader.result as ArrayBuffer; cleanup(); resolve(bytes); };
    reader.onerror = () => { const error = reader.error; cleanup(); reject(error); };
    reader.onabort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    reader.readAsArrayBuffer(blob);
  });
}
