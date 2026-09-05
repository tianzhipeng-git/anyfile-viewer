import { ViewerError } from "@anyfile/viewer-protocol";
import type { DecodeEvent, MediaInfo } from "./types";

export const FFMPEG_VERSION = "9.0.1-anyfile.1";
export const FFMPEG_LOCAL = `/vendor/ffmpeg-playback/${FFMPEG_VERSION}/`;
const SOURCES = [`https://assets.anyfile.top/vendor/ffmpeg-playback/${FFMPEG_VERSION}/`, FFMPEG_LOCAL];
type Pending = { id: number; resolve: (value: unknown) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> };

export class FfmpegClient {
  readonly #worker: Worker;
  #pending?: Pending;
  #id = 0;
  #disposed = false;
  readonly #removeAbort: () => void;
  constructor(signal: AbortSignal) {
    signal.throwIfAborted();
    this.#worker = new Worker(`${FFMPEG_LOCAL}ffmpeg-playback.worker.js`, { type: "module" });
    const abort = () => this.dispose();
    signal.addEventListener("abort", abort, { once: true });
    this.#removeAbort = () => signal.removeEventListener("abort", abort);
    this.#worker.onmessage = ({ data }) => {
      const pending = this.#pending;
      if (!pending || data.id !== pending.id) return;
      this.#pending = undefined; clearTimeout(pending.timer);
      if (data.error) {
        const code = ["invalid-file", "resource-limit", "unsupported-environment"].includes(data.error.code) ? data.error.code : data.error.code === "unsupported-media" ? "invalid-file" : "open-failed";
        pending.reject(new ViewerError(code, "FFmpeg operation failed")); this.dispose();
      } else pending.resolve(data.result);
    };
    this.#worker.onerror = () => this.dispose(new ViewerError("unsupported-environment", "FFmpeg Worker failed"));
    this.#worker.onmessageerror = () => this.dispose(new ViewerError("open-failed", "FFmpeg message failed"));
  }
  request<T>(type: string, fields = {}): Promise<T> {
    if (this.#disposed) return Promise.reject(new DOMException("Disposed", "AbortError"));
    if (this.#pending) return Promise.reject(new Error("Concurrent FFmpeg command"));
    const id = ++this.#id;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.dispose(new ViewerError(type === "init" ? "unsupported-environment" : "resource-limit", "FFmpeg operation timed out")), type === "init" ? 10000 : 15000);
      this.#pending = { id, resolve: value => resolve(value as T), reject, timer };
      try { this.#worker.postMessage({ ...fields, type, id, generation: 0 }); } catch (error) { this.dispose(error); }
    });
  }
  open(file: File, video: boolean) { return this.request<MediaInfo>("open", { file, video }); }
  next() { return this.request<DecodeEvent>("next"); }
  seek(time: number) { return this.request<void>("seek", { time }); }
  dispose(error: unknown = new DOMException("Disposed", "AbortError")) {
    if (this.#disposed) return;
    this.#disposed = true; this.#removeAbort(); this.#worker.terminate();
    this.#worker.onmessage = this.#worker.onerror = this.#worker.onmessageerror = null;
    if (this.#pending) { clearTimeout(this.#pending.timer); this.#pending.reject(error); this.#pending = undefined; }
  }
}
export async function initializeFfmpeg(signal: AbortSignal) {
  for (const source of SOURCES) {
    signal.throwIfAborted();
    const client = new FfmpegClient(signal);
    try { await client.request("init", { assetBase: new URL(source, location.href).href }); return client; }
    catch { client.dispose(); signal.throwIfAborted(); }
  }
  throw new ViewerError("unsupported-environment", "Unable to initialize FFmpeg");
}
