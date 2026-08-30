import { ViewerError, type FileViewerPlugin, type OpenViewerContext, type ViewerController } from "@anyfile/viewer-protocol";
import { abortError } from "./abort-error";
import { inspectAudio } from "./media-inspection";
import { nonNativeAudioManifest } from "./manifest";
import { AudioPlaybackSession } from "./playback-session";
import { createPlayerElements, playerCopy } from "./ui";

async function openNonNativeAudio(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  let session: AudioPlaybackSession | undefined;
  let root: HTMLElement | undefined;
  let inputToDispose: Awaited<ReturnType<typeof inspectAudio>>["input"] | undefined;
  const dispose = async () => {
    signal.removeEventListener("abort", onAbort);
    await session?.dispose(); session = undefined;
    inputToDispose?.dispose(); inputToDispose = undefined;
    root?.remove(); root = undefined;
  };
  const onAbort = () => void dispose();
  try {
    if (signal.aborted) throw abortError();
    if (typeof AudioDecoder === "undefined" || typeof AudioContext === "undefined") throw new ViewerError("unsupported-environment", "当前浏览器缺少 WebCodecs 或 Web Audio 能力。");
    signal.addEventListener("abort", onAbort, { once: true });
    reportProgress({ stage: "reading", message: "正在读取音频轨道…", loaded: 0, total: file.size });
    const media = await inspectAudio(file, signal); inputToDispose = media.input;
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "decoding-first-buffer", message: "正在解码首个音频 buffer…" });
    const copy = playerCopy(context.locale); const elements = createPlayerElements(file.name, media, copy);
    root = elements.root; container.append(root); session = new AudioPlaybackSession(media, elements, copy); session.initialize();
    inputToDispose = undefined; reportProgress({ stage: "ready", message: "音频已打开" }); return { dispose };
  } catch (error) {
    await dispose();
    if (signal.aborted) throw abortError();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", "无法解码这个音频。", { cause: error });
  }
}

export const nonNativeAudioViewer: FileViewerPlugin = { manifest: nonNativeAudioManifest, open: openNonNativeAudio };
export { nonNativeAudioManifest } from "./manifest";
