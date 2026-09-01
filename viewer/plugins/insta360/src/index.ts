import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { decodeX3Photo } from "./image-source";
import { inspectInsta360File } from "./inspection";
import { insta360Manifest } from "./manifest";
import { MediaLoadError, waitForFirstFrame } from "./media-source";
import { PanoramaRenderer } from "./panorama-renderer";
import { abortError } from "./read-blob";
import {
  bindVideoControls,
  createInsta360ViewerElements,
  showFatalError,
  type Insta360ViewerElements,
} from "./ui";

function copyFor(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, {
    en: { reading: "Inspecting the Insta360 file…", decoding: "Decoding the panorama…", loading: "Loading the 360° video…", ready: "Panorama opened", invalid: "This is not a valid supported Insta360 X3 file.", unsupported: "This browser cannot provide the WebGL or media features required for this panorama.", resource: "This panorama exceeds the current device's safe graphics limits.", failed: "The panorama could not be opened." },
    "zh-CN": { reading: "正在检查 Insta360 文件…", decoding: "正在解码全景照片…", loading: "正在加载 360° 视频…", ready: "全景已打开", invalid: "文件不是有效且受支持的 Insta360 X3 文件。", unsupported: "当前浏览器缺少此全景所需的 WebGL 或媒体能力。", resource: "此全景超过当前设备的安全图形资源限制。", failed: "无法打开此全景。" },
  });
}

async function openInsta360(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = copyFor(context.locale);
  let elements: Insta360ViewerElements | undefined;
  let renderer: PanoramaRenderer | undefined;
  let bitmaps: readonly [ImageBitmap, ImageBitmap] | undefined;
  let objectUrl: string | undefined;
  let disposeControls: (() => void) | undefined;
  let resetListener: (() => void) | undefined;
  let mediaErrorListener: (() => void) | undefined;
  let disposed = false;

  const releaseRenderResources = () => {
    disposeControls?.();
    disposeControls = undefined;
    if (mediaErrorListener && elements?.video) elements.video.removeEventListener("error", mediaErrorListener);
    mediaErrorListener = undefined;
    if (elements?.video) {
      try { elements.video.pause(); } catch { /* Detached test media may not implement pause. */ }
      elements.video.removeAttribute("src");
      try { elements.video.load(); } catch { /* Detached test media may not implement load. */ }
    }
    renderer?.dispose();
    renderer = undefined;
    bitmaps?.forEach((bitmap) => bitmap.close());
    bitmaps = undefined;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  };

  const failActive = (message: string) => {
    if (disposed || !elements) return;
    const activeElements = elements;
    releaseRenderResources();
    showFatalError(activeElements, message);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (resetListener && elements) elements.reset.removeEventListener("click", resetListener);
    resetListener = undefined;
    releaseRenderResources();
    elements?.root.remove();
    elements = undefined;
  };

  try {
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const inspection = await inspectInsta360File({ file, signal });
    if (!inspection) throw new ViewerError("invalid-file", copy.invalid);
    if (signal.aborted) throw abortError();

    elements = createInsta360ViewerElements(file.name, inspection, context.locale);
    container.append(elements.root);
    signal.addEventListener("abort", dispose, { once: true });
    renderer = new PanoramaRenderer(elements.canvas, elements.viewport, copy.unsupported, copy.resource, (error) => failActive(error.message));
    resetListener = () => renderer?.reset();
    elements.reset.addEventListener("click", resetListener);

    if (inspection.kind === "photo") {
      reportProgress({ stage: "decoding-image", message: copy.decoding });
      bitmaps = await decodeX3Photo(file, signal, copy.invalid, copy.unsupported);
      renderer.setDualSources(bitmaps[0], bitmaps[1], 2976, 2976);
    } else {
      const video = elements.video;
      if (!video) throw new ViewerError("open-failed", copy.failed);
      reportProgress({ stage: "loading-media", message: copy.loading });
      objectUrl = URL.createObjectURL(file.slice(0, file.size, "video/mp4"));
      video.src = objectUrl;
      const loading = waitForFirstFrame(video, signal);
      video.load();
      await loading;
      if (signal.aborted) throw abortError();
      if (video.videoWidth !== 1024 || video.videoHeight !== 512) throw new ViewerError("invalid-file", copy.invalid);
      renderer.setSbsVideo(video, 1024, 512);
      disposeControls = bindVideoControls(elements, context.locale);
      mediaErrorListener = () => failActive(video.error?.code === 4 ? copy.unsupported : copy.failed);
      video.addEventListener("error", mediaErrorListener);
    }

    if (signal.aborted) throw abortError();
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof MediaLoadError && error.mediaCode === 4) {
      throw new ViewerError("unsupported-environment", copy.unsupported, { cause: error });
    }
    if (error instanceof MediaLoadError && error.mediaCode === 3) {
      throw new ViewerError("invalid-file", copy.invalid, { cause: error });
    }
    throw new ViewerError("open-failed", copy.failed, { cause: error });
  }
}

export const insta360Viewer: FileViewerPlugin = {
  manifest: insta360Manifest,
  open: openInsta360,
};

export { insta360Manifest } from "./manifest";
