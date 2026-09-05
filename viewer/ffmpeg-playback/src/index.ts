import { ViewerError, type OpenViewerContext } from "@anyfile/viewer-protocol";
import { initializeFfmpeg, type FfmpegClient } from "./client";
import { PlaybackSession } from "./session";
import { createElements, messages } from "./ui";
import type { MediaInfo } from "./types";
export type { MediaInfo } from "./types";

export async function openFfmpeg(context: OpenViewerContext, video: boolean, validate: (info: MediaInfo) => boolean) {
  const copy = messages(context.locale);
  let client: FfmpegClient | undefined, session: PlaybackSession | undefined;
  const dispose = async () => { context.signal.removeEventListener("abort", onAbort); client?.dispose(); await session?.dispose(); };
  const onAbort = () => { void dispose(); };
  try {
    context.signal.throwIfAborted();
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined" || (video && typeof VideoFrame === "undefined") || typeof AudioContext === "undefined") throw new ViewerError("unsupported-environment", copy.environment);
    context.signal.addEventListener("abort", onAbort, { once: true });
    context.reportProgress({ stage: "initializing", message: copy.loading });
    client = await initializeFfmpeg(context.signal);
    const info = await client.open(context.file, video); context.signal.throwIfAborted();
    if (!validate(info) || !Number.isFinite(info.duration) || info.duration <= 0) throw new ViewerError("invalid-file", copy.invalid);
    const elements = createElements(context.file.name, info, copy);
    session = new PlaybackSession(client, info, elements, copy); context.container.append(elements.root);
    await session.initialize(); context.signal.throwIfAborted();
    return { dispose };
  } catch (error) {
    await dispose(); context.signal.throwIfAborted();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const code = error instanceof ViewerError ? error.code : "open-failed";
    throw new ViewerError(code, code === "resource-limit" ? copy.limit : code === "unsupported-environment" ? copy.environment : copy.failed, { cause: error });
  }
}
