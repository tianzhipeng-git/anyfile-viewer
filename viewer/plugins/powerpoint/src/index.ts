import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from "@aiden0z/pptx-renderer";
import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { powerpointManifest } from "./manifest";

const MAX_FILE_BYTES = 80 * 1024 * 1024;

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function readBlob(blob: Blob, signal: AbortSignal): Promise<ArrayBuffer> {
  if (signal.aborted) throw abortError();
  const reader = blob.stream().getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      byteLength += value.byteLength;
    }
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }

  if (signal.aborted) throw abortError();
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

function getCopy(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, { "zh-CN": {
    reading: "正在读取 PowerPoint 演示文稿…",
    rendering: "正在渲染幻灯片…",
    invalid: "文件内容不是有效的 PPTX 演示文稿。",
    tooLarge: "PowerPoint 演示文稿超过浏览器安全资源上限。",
    ready: "PowerPoint 演示文稿已打开",
  }, en: {
    reading: "Reading PowerPoint presentation…",
    rendering: "Rendering slides…",
    invalid: "The file is not a valid PPTX presentation.",
    tooLarge: "The PowerPoint presentation exceeds the browser-safe resource limit.",
    ready: "PowerPoint presentation opened",
  } });
}

function createViewerRoot(fileName: string) {
  const root = document.createElement("div");
  root.className = "anyfile-powerpoint-viewer";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-powerpoint-viewer { display:flex; min-height:100%; width:100%; flex-direction:column; overflow:hidden; background:#e5e7eb; color:#111827; font-family:var(--viewer-font-family,system-ui); }
    .anyfile-powerpoint-viewer__toolbar { display:flex; min-height:48px; align-items:center; padding:8px 14px; border-bottom:1px solid var(--viewer-border,#d1d5db); background:var(--viewer-background,#fff); }
    .anyfile-powerpoint-viewer__name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-powerpoint-viewer__slides { min-height:560px; flex:1; overflow:auto; padding:24px; }
  `;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-powerpoint-viewer__toolbar";
  const name = document.createElement("strong");
  name.className = "anyfile-powerpoint-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  toolbar.append(name);
  const slides = document.createElement("div");
  slides.className = "anyfile-powerpoint-viewer__slides";
  root.append(style, toolbar, slides);
  return { root, slides };
}

async function openPowerpoint(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = getCopy(context.locale);
  const { root, slides } = createViewerRoot(file.name);
  let disposed = false;
  let viewer: PptxViewer | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    viewer?.destroy();
    root.remove();
  };

  try {
    if (signal.aborted) throw abortError();
    if (file.size > MAX_FILE_BYTES) {
      throw new ViewerError("resource-limit", copy.tooLarge);
    }
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const bytes = await readBlob(file.slice(0, file.size), signal);
    const signature = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
    if (signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) {
      throw new ViewerError("invalid-file", copy.invalid);
    }

    container.append(root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "rendering", message: copy.rendering, loaded: file.size, total: file.size });
    viewer = await PptxViewer.open(bytes, slides, {
      fitMode: "contain",
      lazyMedia: true,
      lazySlides: true,
      listOptions: { batchSize: 4, initialSlides: 4, windowed: true },
      pdfjs: false,
      renderMode: "list",
      scrollContainer: slides,
      signal,
      zipLimits: RECOMMENDED_ZIP_LIMITS,
    });
    if (signal.aborted || disposed) {
      viewer.destroy();
      viewer = undefined;
      throw abortError();
    }
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) {
      throw error;
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const powerpointViewer: FileViewerPlugin = {
  manifest: powerpointManifest,
  open: openPowerpoint,
};

export { powerpointManifest } from "./manifest";
