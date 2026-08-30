import { abortError } from "./abort-error";

export class MediaLoadError extends Error {
  constructor(readonly mediaCode: number) {
    super(`HTMLMediaElement failed with code ${mediaCode}`);
  }
}

export function waitForAudioData(audio: HTMLAudioElement, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("loadeddata", onLoadedData);
      audio.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onLoadedData = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new MediaLoadError(audio.error?.code ?? 0)); };
    const onAbort = () => { cleanup(); reject(abortError()); };
    audio.addEventListener("loadeddata", onLoadedData, { once: true });
    audio.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
