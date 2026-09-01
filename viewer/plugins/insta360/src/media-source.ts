import { abortError } from "./read-blob";

export class MediaLoadError extends Error {
  constructor(readonly mediaCode: number) {
    super(`HTMLMediaElement failed with code ${mediaCode}.`);
  }
}

export function waitForFirstFrame(video: HTMLVideoElement, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const loaded = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new MediaLoadError(video.error?.code ?? 0)); };
    const aborted = () => { cleanup(); reject(abortError()); };
    video.addEventListener("loadeddata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
  });
}
