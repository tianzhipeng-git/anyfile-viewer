import { ViewerError, type FileViewerPlugin, type OpenViewerContext, type ViewerController } from "@anyfile/viewer-protocol";
import { MAX_RAW_SOURCE_BYTES, PROBE_BYTES } from "./limits";
import { cameraRawManifest } from "./manifest";
import { inspectRawHeader } from "./probe-format";
import { CameraRawDecoder } from "./raw-decoder";
import { abortError, readBlob } from "./read-blob";
import { createCameraRawElements, updateRawMetadata, type CameraRawElements } from "./ui";
import { RawBitmapViewport } from "./viewport";

function copyFor(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? {
    reading: "正在读取相机 RAW…", opening: "正在初始化 RAW decoder…", developing: "正在执行基础 RAW 显影…", readyPreview: "当前显示内嵌预览", readyDeveloped: "当前显示基础 RAW 显影", failed: "基础 RAW 显影失败，保留内嵌预览。", invalid: "文件不是有效的受支持相机 RAW。", isolated: "RAW 显影需要启用跨源隔离的 /view 页面。",
  } : {
    reading: "Reading camera RAW…", opening: "Initializing RAW decoder…", developing: "Developing basic RAW image…", readyPreview: "Showing embedded preview", readyDeveloped: "Showing basic RAW development", failed: "Basic RAW development failed; embedded preview remains available.", invalid: "The file is not a valid supported camera RAW.", isolated: "RAW development requires a cross-origin-isolated /view page.",
  };
}

async function openCameraRaw(context: OpenViewerContext): Promise<ViewerController> {
  const { file, signal, container, reportProgress } = context;
  const copy = copyFor(context.locale);
  let root: HTMLElement | undefined; let elements: CameraRawElements | undefined; let viewport: RawBitmapViewport | undefined; let decoder: CameraRawDecoder | undefined;
  let previewBitmap: ImageBitmap | undefined; let developedBitmap: ImageBitmap | undefined; let disposed = false; let previewClick: (() => void) | undefined; let developedClick: (() => void) | undefined;

  const show = (kind: "preview" | "developed") => {
    const bitmap = kind === "preview" ? previewBitmap : developedBitmap;
    if (!bitmap || !elements || !viewport || disposed) return;
    viewport.setBitmap(bitmap); elements.preview.setAttribute("aria-pressed", String(kind === "preview")); elements.developed.setAttribute("aria-pressed", String(kind === "developed")); elements.status.textContent = kind === "preview" ? copy.readyPreview : copy.readyDeveloped;
  };
  const dispose = () => {
    if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose);
    if (elements && previewClick) elements.preview.removeEventListener("click", previewClick); if (elements && developedClick) elements.developed.removeEventListener("click", developedClick);
    decoder?.dispose(); viewport?.dispose(); previewBitmap?.close(); developedBitmap?.close(); root?.remove(); decoder = undefined; viewport = undefined; root = undefined;
  };
  const develop = async () => {
    if (!decoder || disposed || !elements) return;
    elements.status.textContent = copy.developing;
    try {
      developedBitmap = await decoder.developed();
      if (disposed) { developedBitmap.close(); developedBitmap = undefined; return; }
      elements.developed.hidden = false; show("developed");
    } catch (error) {
      if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) elements.status.textContent = previewBitmap ? copy.failed : copy.invalid;
    }
  };

  try {
    if (signal.aborted) throw abortError();
    if (globalThis.crossOriginIsolated !== true) throw new ViewerError("unsupported-environment", copy.isolated);
    if (file.size === 0) throw new ViewerError("invalid-file", copy.invalid);
    if (file.size > MAX_RAW_SOURCE_BYTES) throw new ViewerError("resource-limit", "RAW 文件超过 256 MiB 输入上限。");
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const header = await readBlob(file.slice(0, PROBE_BYTES), signal); const inspection = inspectRawHeader(header, file.name);
    if (!inspection) throw new ViewerError("invalid-file", copy.invalid);
    elements = createCameraRawElements(file.name, context.locale); root = elements.root; container.append(root); viewport = new RawBitmapViewport(elements);
    reportProgress({ stage: "decoding", message: copy.opening, loaded: Math.min(file.size, PROBE_BYTES), total: file.size });
    const bytes = await readBlob(file, signal); decoder = new CameraRawDecoder(signal); await decoder.open(bytes); const metadata = await decoder.metadata(); updateRawMetadata(elements, inspection.format, metadata);
    previewBitmap = await decoder.thumbnail();
    previewClick = () => show("preview"); developedClick = () => show("developed"); elements.preview.addEventListener("click", previewClick); elements.developed.addEventListener("click", developedClick);
    if (previewBitmap) { elements.preview.hidden = false; show("preview"); void develop(); } else { await develop(); if (!developedBitmap) throw new ViewerError("invalid-file", copy.invalid); }
    if (signal.aborted) throw abortError();
    signal.addEventListener("abort", dispose, { once: true }); reportProgress({ stage: "ready", message: previewBitmap ? copy.readyPreview : copy.readyDeveloped }); return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const cameraRawViewer: FileViewerPlugin = { manifest: cameraRawManifest, open: openCameraRaw };
export { cameraRawManifest } from "./manifest";
