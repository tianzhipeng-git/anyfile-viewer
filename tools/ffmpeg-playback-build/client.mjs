// One outstanding pull means the Worker cannot accumulate decoded output in its message queue.
export class PlaybackClient {
  #worker;
  #pending;
  #id = 0;
  #generation = 0;
  #disposed = false;
  #removeAbort;

  constructor(url, signal) {
    signal?.throwIfAborted();
    this.#worker = new Worker(url, { type: "module" });
    this.#worker.onmessage = ({ data }) => {
      const request = this.#pending;
      if (!request || data.id !== request.id || data.generation !== request.generation) return;
      this.#pending = undefined;
      clearTimeout(request.timer);
      if (data.error) {
        request.reject(Object.assign(new Error(data.error.message), { code: data.error.code }));
        this.dispose();
      } else request.resolve(data.result);
    };
    this.#worker.onerror = () => this.dispose(Object.assign(new Error("FFmpeg Worker failed"), { code: "unsupported-environment" }));
    this.#worker.onmessageerror = () => this.dispose(new Error("Invalid FFmpeg Worker message"));
    if (signal) {
      const abort = () => this.dispose(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      this.#removeAbort = () => signal.removeEventListener("abort", abort);
    }
  }

  request(type, fields = {}) {
    if (this.#disposed) return Promise.reject(new DOMException("Disposed", "AbortError"));
    if (this.#pending) return Promise.reject(new Error("Await the previous FFmpeg command before issuing another"));
    if (type === "seek") this.#generation++;
    const id = ++this.#id, generation = this.#generation;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.dispose(Object.assign(new Error("FFmpeg command exceeded 15 seconds"), { code: "resource-limit" })), 15000);
      this.#pending = { id, generation, timer, resolve, reject };
      try { this.#worker.postMessage({ ...fields, type, id, generation }); }
      catch (error) { this.dispose(error); }
    });
  }

  dispose(reason = new DOMException("Disposed", "AbortError")) {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#removeAbort?.();
    this.#worker.terminate();
    this.#worker.onmessage = this.#worker.onerror = this.#worker.onmessageerror = null;
    if (this.#pending) {
      clearTimeout(this.#pending.timer);
      this.#pending.reject(reason);
      this.#pending = undefined;
    }
  }
}
