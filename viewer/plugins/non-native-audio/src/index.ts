import { ViewerError, selectMessages, type FileViewerPlugin, type OpenViewerContext, type ViewerController } from "@anyfile/viewer-protocol";
import { abortError } from "./abort-error";
import { inspectAudio } from "./media-inspection";
import { nonNativeAudioManifest } from "./manifest";
import { AudioPlaybackSession } from "./playback-session";
import { createPlayerElements, playerCopy } from "./ui";

async function openNonNativeAudio(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = selectMessages(context.locale, { "zh-CN": {
    unsupported: "当前浏览器缺少 WebCodecs 或 Web Audio 能力。", reading: "正在读取音频轨道…",
    decoding: "正在解码首个音频 buffer…", ready: "音频已打开", invalid: "无法解码这个音频。",
  }, en: {
    unsupported: "This browser does not provide WebCodecs or Web Audio.", reading: "Reading audio tracks…",
    decoding: "Decoding the first audio buffer…", ready: "Audio opened", invalid: "Unable to decode this audio file.",
  } });
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
    if (typeof AudioDecoder === "undefined" || typeof AudioContext === "undefined") throw new ViewerError("unsupported-environment", copy.unsupported);
    signal.addEventListener("abort", onAbort, { once: true });
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const media = await inspectAudio(file, signal); inputToDispose = media.input;
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "decoding-first-buffer", message: copy.decoding });
    const playerMessages = playerCopy(context.locale); const elements = createPlayerElements(file.name, media, playerMessages);
    root = elements.root; container.append(root); session = new AudioPlaybackSession(media, elements, playerMessages); session.initialize();
    inputToDispose = undefined; reportProgress({ stage: "ready", message: copy.ready }); return { dispose };
  } catch (error) {
    await dispose();
    if (signal.aborted) throw abortError();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ViewerError(error instanceof ViewerError ? error.code : "invalid-file", copy.invalid, { cause: error });
  }
}

export const nonNativeAudioViewer: FileViewerPlugin = { manifest: nonNativeAudioManifest, open: openNonNativeAudio };
export { nonNativeAudioManifest } from "./manifest";
