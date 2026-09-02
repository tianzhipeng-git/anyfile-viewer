import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { decodeGoProMaxPhoto } from "./image-source";
import { inspectGoProMaxFile } from "./inspection";
import { goProMaxManifest } from "./manifest";
import { GoProPanoramaRenderer } from "./panorama-renderer";
import { GoProMaxPlayback } from "./playback";
import { abortError } from "./read-blob";
import { createGoProMaxViewerElements, goProMaxUiCopy, showFatalError, type GoProMaxViewerElements } from "./ui";

function copyFor(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, {
    en: { reading: "Inspecting the GoPro MAX file…", decoding: "Decoding the panorama…", loading: "Loading the 360° video…", ready: "Panorama opened", invalid: "This is not a valid supported GoPro MAX file.", unsupported: "This browser cannot provide the WebGL, WebCodecs, HEVC or audio features required for this panorama.", resource: "This panorama exceeds the current device's safe graphics limits.", failed: "The GoPro MAX panorama could not be opened." },
    "zh-CN": { reading: "正在检查 GoPro MAX 文件…", decoding: "正在解码全景照片…", loading: "正在加载 360° 视频…", ready: "全景已打开", invalid: "文件不是有效且受支持的 GoPro MAX 文件。", unsupported: "当前浏览器缺少此全景所需的 WebGL、WebCodecs、HEVC 或音频能力。", resource: "此全景超过当前设备的安全图形资源限制。", failed: "无法打开 GoPro MAX 全景。" },
  });
}

async function openGoProMax(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = copyFor(context.locale);
  let elements: GoProMaxViewerElements | undefined;
  let renderer: GoProPanoramaRenderer | undefined;
  let bitmap: ImageBitmap | undefined;
  let playback: GoProMaxPlayback | undefined;
  let resetListener: (() => void) | undefined;
  let disposed = false;

  const releaseResources = () => {
    void playback?.dispose();
    playback = undefined;
    renderer?.dispose();
    renderer = undefined;
    bitmap?.close();
    bitmap = undefined;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (resetListener && elements) elements.reset.removeEventListener("click", resetListener);
    resetListener = undefined;
    releaseResources();
    elements?.root.remove();
    elements = undefined;
  };
  const failActive = (message: string) => {
    if (disposed || !elements) return;
    const activeElements = elements;
    releaseResources();
    showFatalError(activeElements, message);
  };

  try {
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const inspection = await inspectGoProMaxFile({ file, signal });
    if (!inspection) throw new ViewerError("invalid-file", copy.invalid);
    if (signal.aborted) throw abortError();
    elements = createGoProMaxViewerElements(file.name, inspection, context.locale);
    container.append(elements.root);
    signal.addEventListener("abort", dispose, { once: true });
    renderer = new GoProPanoramaRenderer(elements.canvas, elements.viewport, copy.unsupported, copy.resource, (error) => failActive(error.message));
    resetListener = () => renderer?.reset();
    elements.reset.addEventListener("click", resetListener);
    if (inspection.kind === "photo") {
      reportProgress({ stage: "decoding-image", message: copy.decoding });
      bitmap = await decodeGoProMaxPhoto(file, signal, copy.invalid, copy.unsupported);
      renderer.setEquirectangularSource(bitmap, inspection.width, inspection.height);
    } else {
      reportProgress({ stage: "loading-media", message: copy.loading });
      playback = await GoProMaxPlayback.open(file, inspection, renderer, elements, goProMaxUiCopy(context.locale), signal);
    }
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ViewerError) {
      const message = error.code === "invalid-file" ? copy.invalid
        : error.code === "unsupported-environment" ? copy.unsupported
          : error.code === "resource-limit" ? copy.resource
            : copy.failed;
      throw new ViewerError(error.code, message, { cause: error });
    }
    throw new ViewerError("open-failed", copy.failed, { cause: error });
  }
}

export const goProMaxViewer: FileViewerPlugin = { manifest: goProMaxManifest, open: openGoProMax };

export { goProMaxManifest } from "./manifest";
