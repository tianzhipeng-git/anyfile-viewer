import {
  ViewerError,
  selectMessages,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { abortError } from "./abort-error";
import { inspectMedia } from "./media-inspection";
import { PlaybackSession } from "./playback-session";
import { createPlayerElements, playerCopy } from "./ui";

export async function openMediabunnyVideo(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = selectMessages(context.locale, { "zh-CN": {
    videoUnsupported: "当前浏览器缺少视频 WebCodecs 解码能力。", audioUnsupported: "当前浏览器缺少 Web Audio 能力。",
    reading: "正在读取视频轨道…", decoding: "正在解码首帧与主音轨…", ready: "视频已打开", invalid: "无法解码这个视频。",
  }, en: {
    videoUnsupported: "This browser does not provide the required video WebCodecs decoder.", audioUnsupported: "This browser does not provide Web Audio.",
    reading: "Reading video tracks…", decoding: "Decoding the first frame and primary audio track…", ready: "Video opened", invalid: "Unable to decode this video.",
  } });
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
      throw new ViewerError("unsupported-environment", copy.videoUnsupported);
    }
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const media = await inspectMedia(file, signal);
    inputToDispose = media.input;
    if (media.audioTrack && typeof AudioContext === "undefined") {
      throw new ViewerError("unsupported-environment", copy.audioUnsupported);
    }
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "decoding-first-frame", message: copy.decoding });
    const playerMessages = playerCopy(context.locale);
    const elements = createPlayerElements(file.name, media, playerMessages);
    root = elements.root;
    container.append(root);
    session = new PlaybackSession(media, elements, playerMessages);
    await session.initialize();
    if (signal.aborted) throw abortError();
    inputToDispose = undefined;
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    await dispose();
    if (signal.aborted) throw abortError();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ViewerError(error instanceof ViewerError ? error.code : "invalid-file", copy.invalid, { cause: error });
  }
}
