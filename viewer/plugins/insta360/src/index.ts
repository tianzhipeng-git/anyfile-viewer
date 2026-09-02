import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { decodeInsta360Dng } from "./dng-source";
import { decodeEmbeddedPreview } from "./embedded-preview";
import { decodeX3Photo } from "./image-source";
import { inspectInsta360File } from "./inspection";
import { insta360Manifest } from "./manifest";
import { MediaLoadError, waitForFirstFrame } from "./media-source";
import { findInsvPair } from "./pairing";
import { PanoramaRenderer } from "./panorama-renderer";
import { ONE_RS_VIDEO_PROJECTION, X3_VIDEO_PROJECTION, X4_INSV_PROJECTION, X4_VIDEO_PROJECTION, X5_VIDEO_PROJECTION, X6_PROJECTION } from "./projection";
import { abortError } from "./read-blob";
import { inspectInsta360Video } from "./video-inspection";
import {
  bindVideoControls,
  createInsta360ViewerElements,
  insta360UiCopy,
  showFatalError,
  showStaticPreview,
  type Insta360ViewerElements,
} from "./ui";

function copyFor(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, {
    en: { reading: "Inspecting the Insta360 file…", pairing: "Finding the paired Insta360 video…", decoding: "Decoding the panorama…", developing: "Developing the Insta360 RAW panorama…", loading: "Loading the 360° video…", ready: "Panorama opened", invalid: "This is not a valid supported Insta360 file.", missingPair: "Select both matching INSV files together, or open the folder that contains them.", unsupported: "This browser cannot provide the WebGL, media or RAW decoding features required for this panorama.", resource: "This panorama exceeds the current device's safe resource limits.", rawTooLarge: "The Insta360 RAW file exceeds the 256 MiB input limit.", failed: "The panorama could not be opened." },
    "zh-CN": { reading: "正在检查 Insta360 文件…", pairing: "正在查找成对的 Insta360 视频…", decoding: "正在解码全景照片…", developing: "正在显影 Insta360 RAW 全景…", loading: "正在加载 360° 视频…", ready: "全景已打开", invalid: "文件不是有效且受支持的 Insta360 文件。", missingPair: "请同时选择成对的 INSV 文件，或打开包含它们的整个文件夹。", unsupported: "当前浏览器缺少此全景所需的 WebGL、媒体或 RAW 解码能力。", resource: "此全景超过当前设备的安全资源限制。", rawTooLarge: "Insta360 RAW 文件超过 256 MiB 输入上限。", failed: "无法打开此全景。" },
  });
}

async function openInsta360(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = copyFor(context.locale);
  let elements: Insta360ViewerElements | undefined;
  let renderer: PanoramaRenderer | undefined;
  let bitmaps: readonly [ImageBitmap, ImageBitmap] | undefined;
  let previewBitmap: ImageBitmap | undefined;
  const objectUrls: string[] = [];
  let disposeControls: (() => void) | undefined;
  let disposeDualTrack: (() => Promise<void>) | undefined;
  let resetListener: (() => void) | undefined;
  const mediaErrorListeners: Array<{ video: HTMLVideoElement; listener: () => void }> = [];
  let disposed = false;

  const releaseRenderResources = () => {
    disposeControls?.();
    disposeControls = undefined;
    void disposeDualTrack?.();
    disposeDualTrack = undefined;
    for (const { video, listener } of mediaErrorListeners.splice(0)) video.removeEventListener("error", listener);
    for (const video of [elements?.video, elements?.secondVideo]) {
      if (!video) continue;
      try { video.pause(); } catch { /* Detached test media may not implement pause. */ }
      video.removeAttribute("src");
      try { video.load(); } catch { /* Detached test media may not implement load. */ }
    }
    renderer?.dispose();
    renderer = undefined;
    bitmaps?.forEach((bitmap) => bitmap.close());
    bitmaps = undefined;
    previewBitmap?.close();
    previewBitmap = undefined;
    for (const objectUrl of objectUrls.splice(0)) URL.revokeObjectURL(objectUrl);
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

    let pair: Awaited<ReturnType<typeof findInsvPair>> = undefined;
    if (inspection.kind === "video" && inspection.layout === "paired-files") {
      reportProgress({ stage: "finding-pair", message: copy.pairing });
      pair = await findInsvPair(file, inspection, context.workspace, signal, inspectInsta360Video);
      if (!pair) throw new ViewerError("missing-related-file", copy.missingPair);
    }

    elements = createInsta360ViewerElements(file.name, inspection, context.locale);
    container.append(elements.root);
    signal.addEventListener("abort", dispose, { once: true });
    renderer = new PanoramaRenderer(elements.canvas, elements.viewport, copy.unsupported, copy.resource, (error) => failActive(error.message));
    resetListener = () => renderer?.reset();
    elements.reset.addEventListener("click", resetListener);

    if (inspection.kind === "photo" || inspection.kind === "raw") {
      reportProgress({ stage: inspection.kind === "raw" ? "developing-raw" : "decoding-image", message: inspection.kind === "raw" ? copy.developing : copy.decoding });
      bitmaps = inspection.kind === "raw"
        ? await decodeInsta360Dng(file, inspection, signal, copy.invalid, copy.unsupported, copy.rawTooLarge, copy.resource, copy.failed)
        : await decodeX3Photo(file, signal, copy.invalid, copy.unsupported);
      const lensSize = inspection.kind === "raw" ? inspection.device === "X6" ? inspection.lensSize / 2 : inspection.lensSize : 2976;
      const projection = inspection.kind === "raw" && inspection.device === "X6" ? X6_PROJECTION : undefined;
      renderer.setDualSources(bitmaps[0], bitmaps[1], lensSize, lensSize, projection);
    } else {
      reportProgress({ stage: "loading-media", message: copy.loading });
      const projection = inspection.projection ?? (inspection.device === "One RS" ? ONE_RS_VIDEO_PROJECTION
        : inspection.device === "X4" ? inspection.layout === "dual-track" ? X4_INSV_PROJECTION : X4_VIDEO_PROJECTION
          : inspection.device === "X5" ? X5_VIDEO_PROJECTION
            : inspection.device === "X6" ? X6_PROJECTION
              : X3_VIDEO_PROJECTION);
      if (inspection.layout === "dual-track") {
        const { DualTrackPlayback } = await import("./dual-track-playback");
        try {
          const playback = await DualTrackPlayback.open(file, inspection, projection, renderer, elements, insta360UiCopy(context.locale), signal);
          if (disposed) {
            await playback.dispose();
            throw abortError();
          }
          disposeDualTrack = () => playback.dispose();
        } catch (error) {
          if (!(error instanceof ViewerError) || error.code !== "unsupported-environment" || !inspection.preview) throw error;
          previewBitmap = await decodeEmbeddedPreview(file, inspection.preview, signal, copy.invalid);
          renderer.setEquirectangularSource(previewBitmap, inspection.preview.width, inspection.preview.height);
          showStaticPreview(elements, context.locale);
        }
      } else {
        const video = elements.video;
        if (!video) throw new ViewerError("open-failed", copy.failed);
        if (pair) {
          const secondVideo = elements.secondVideo;
          if (!secondVideo) throw new ViewerError("open-failed", copy.failed);
          video.muted = false;
          secondVideo.muted = true;
          objectUrls.push(
            URL.createObjectURL(pair.front.slice(0, pair.front.size, "video/mp4")),
            URL.createObjectURL(pair.back.slice(0, pair.back.size, "video/mp4")),
          );
          video.src = objectUrls[0];
          secondVideo.src = objectUrls[1];
          const loading = Promise.all([waitForFirstFrame(video, signal), waitForFirstFrame(secondVideo, signal)]);
          video.load();
          secondVideo.load();
          await loading;
          if (signal.aborted) throw abortError();
          if (video.videoWidth !== inspection.width || video.videoHeight !== inspection.height
            || secondVideo.videoWidth !== inspection.width || secondVideo.videoHeight !== inspection.height) {
            throw new ViewerError("invalid-file", copy.invalid);
          }
          renderer.setDualVideos(video, secondVideo, inspection.width, inspection.height, projection);
        } else {
          objectUrls.push(URL.createObjectURL(file.slice(0, file.size, "video/mp4")));
          video.src = objectUrls[0];
          const loading = waitForFirstFrame(video, signal);
          video.load();
          await loading;
          if (signal.aborted) throw abortError();
          if (video.videoWidth !== inspection.width || video.videoHeight !== inspection.height) throw new ViewerError("invalid-file", copy.invalid);
          renderer.setSbsVideo(video, inspection.width, inspection.height, projection);
        }
        disposeControls = bindVideoControls(elements, context.locale);
        for (const media of [video, elements.secondVideo]) {
          if (!media) continue;
          const listener = () => failActive(media.error?.code === 4 ? copy.unsupported : copy.failed);
          media.addEventListener("error", listener);
          mediaErrorListeners.push({ video: media, listener });
        }
      }
    }

    if (signal.aborted) throw abortError();
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ViewerError) {
      const message = error.code === "invalid-file" ? copy.invalid
        : error.code === "missing-related-file" ? copy.missingPair
          : error.code === "unsupported-environment" ? copy.unsupported
            : error.code === "resource-limit" ? copy.resource
              : copy.failed;
      throw new ViewerError(error.code, message, { cause: error });
    }
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
