import { abortError } from "./read-blob";

export class MediaLoadError extends Error {
  readonly mediaCode: number;

  constructor(mediaCode: number) {
    super(`HTMLMediaElement failed with code ${mediaCode}`);
    this.mediaCode = mediaCode;
  }
}

export function waitForFirstFrame(video: HTMLVideoElement, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onLoadedData = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new MediaLoadError(video.error?.code ?? 0));
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    video.addEventListener("loadeddata", onLoadedData, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
