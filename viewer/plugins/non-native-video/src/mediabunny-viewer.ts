import {
  ViewerError,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { abortError } from "./abort-error";
import { inspectMedia } from "./media-inspection";
import { PlaybackSession } from "./playback-session";
import { createPlayerElements, playerCopy } from "./ui";

export async function openMediabunnyVideo(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  let session: PlaybackSession | undefined;
  let root: HTMLElement | undefined;
  let inputToDispose: Awaited<ReturnType<typeof inspectMedia>>["input"] | undefined;
  const dispose = async () => {
    signal.removeEventListener("abort", onAbort);
    await session?.dispose();
    session = undefined;
    inputToDispose?.dispose();
    inputToDispose = undefined;
    root?.remove();
    root = undefined;
  };
  const onAbort = () => void dispose();

  try {
    if (signal.aborted) throw abortError();
    signal.addEventListener("abort", onAbort, { once: true });
    if (typeof VideoDecoder === "undefined") {
      throw new ViewerError("unsupported-environment", "当前浏览器缺少视频 WebCodecs 解码能力。");
    }
    reportProgress({ stage: "reading", message: "正在读取视频轨道…", loaded: 0, total: file.size });
    const media = await inspectMedia(file, signal);
    inputToDispose = media.input;
    if (media.audioTrack && typeof AudioContext === "undefined") {
      throw new ViewerError("unsupported-environment", "当前浏览器缺少 Web Audio 能力。");
    }
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "decoding-first-frame", message: "正在解码首帧与主音轨…" });
    const copy = playerCopy(context.locale);
    const elements = createPlayerElements(file.name, media, copy);
    root = elements.root;
    container.append(root);
    session = new PlaybackSession(media, elements, copy);
    await session.initialize();
    if (signal.aborted) throw abortError();
    inputToDispose = undefined;
    reportProgress({ stage: "ready", message: "视频已打开" });
    return { dispose };
  } catch (error) {
    await dispose();
    if (signal.aborted) throw abortError();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", "无法解码这个视频。", { cause: error });
  }
}
