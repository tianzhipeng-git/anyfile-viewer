import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { inspectVideoFile } from "./inspect";
import { browserVideoManifest } from "./manifest";
import { MediaLoadError, waitForFirstFrame } from "./media-load";
import { abortError } from "./read-blob";
import { createVideoViewerElements, updateVideoMetadata } from "./ui";

function copyFor(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, { "zh-CN": {
    reading: "正在检查视频容器与编码…",
    loading: "正在使用浏览器加载视频…",
    ready: "视频已打开",
    invalid: "文件不是有效、完整且受支持的视频。",
    noVideo: "文件没有可播放的视频轨道。",
    unsupported: "当前浏览器或系统不能播放这个视频编码组合。",
    failed: "浏览器无法加载这个视频。",
  }, en: {
    reading: "Inspecting the video container and codecs…",
    loading: "Loading the video in the browser…",
    ready: "Video opened",
    invalid: "The file is not a valid, complete supported video.",
    noVideo: "The file does not contain a playable video track.",
    unsupported: "This browser or system cannot play the video's codec combination.",
    failed: "The browser could not load this video.",
  } });
}

function mapMediaError(error: MediaLoadError, copy: ReturnType<typeof copyFor>) {
  if (error.mediaCode === 4) {
    return new ViewerError("unsupported-environment", copy.unsupported, { cause: error });
  }
  if (error.mediaCode === 3) {
    return new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
  return new ViewerError("open-failed", copy.failed, { cause: error });
}

async function openBrowserVideo(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = copyFor(context.locale);
  let objectUrl: string | undefined;
  let root: HTMLElement | undefined;
  let video: HTMLVideoElement | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (video) {
      try { video.pause(); } catch { /* Media state may already be detached. */ }
      video.querySelectorAll("source").forEach((source) => source.remove());
      video.removeAttribute("src");
      try { video.load(); } catch { /* happy-dom and detached media elements may not implement load. */ }
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
    root?.remove();
    root = undefined;
  };

  try {
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const inspection = await inspectVideoFile({ file, signal });
    if (!inspection) throw new ViewerError("invalid-file", copy.invalid);
    if (inspection.videoTracks.length === 0) throw new ViewerError("invalid-file", copy.noVideo);
    if (!inspection.codecsSupported) throw new ViewerError("unsupported-environment", copy.unsupported);
    if (signal.aborted) throw abortError();

    reportProgress({
      stage: "loading-media",
      message: copy.loading,
      loaded: Math.min(file.size, 512 * 1024),
      total: file.size,
    });
    const elements = createVideoViewerElements(file.name, inspection);
    root = elements.root;
    video = elements.video;
    container.append(root);
    objectUrl = URL.createObjectURL(file);
    signal.addEventListener("abort", dispose, { once: true });
    video.src = objectUrl;
    const loading = waitForFirstFrame(video, signal);
    video.load();
    await loading;
    if (signal.aborted) throw abortError();
    if (!video.videoWidth || !video.videoHeight) throw new ViewerError("invalid-file", copy.noVideo);
    updateVideoMetadata(elements.metadata, inspection, video);
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    if (error instanceof MediaLoadError) throw mapMediaError(error, copy);
    throw new ViewerError("open-failed", copy.failed, { cause: error });
  }
}

export const browserVideoViewer: FileViewerPlugin = {
  manifest: browserVideoManifest,
  open: openBrowserVideo,
};

export { browserVideoManifest } from "./manifest";
