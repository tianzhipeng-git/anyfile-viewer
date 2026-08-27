import { renderAsync } from "docx-preview";
import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { wordManifest } from "./manifest";

const MAX_FILE_BYTES = 30 * 1024 * 1024;

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

function getCopy(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? {
    reading: "正在读取 Word 文档…",
    rendering: "正在排版 Word 文档…",
    invalid: "文件内容不是有效的 DOCX 文档。",
    tooLarge: "Word 文档超过浏览器安全资源上限。",
    ready: "Word 文档已打开",
  } : {
    reading: "Reading Word document…",
    rendering: "Rendering Word document…",
    invalid: "The file is not a valid DOCX document.",
    tooLarge: "The Word document exceeds the browser-safe resource limit.",
    ready: "Word document opened",
  };
}

function createViewerRoot(fileName: string) {
  const root = document.createElement("div");
  root.className = "anyfile-word-viewer";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-word-viewer { min-height:100%; width:100%; background:#e5e7eb; color:#111827; font-family:var(--viewer-font-family,system-ui); }
    .anyfile-word-viewer__toolbar { position:sticky; top:0; z-index:10; display:flex; align-items:center; min-height:48px; padding:8px 14px; border-bottom:1px solid var(--viewer-border,#d1d5db); background:var(--viewer-background,#fff); }
    .anyfile-word-viewer__name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-word-viewer__document { min-height:560px; padding:24px 0; }
    .anyfile-word-viewer__document .anyfile-docx-wrapper { padding:0; background:transparent; }
  `;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-word-viewer__toolbar";
  const name = document.createElement("strong");
  name.className = "anyfile-word-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  toolbar.append(name);
  const documentHost = document.createElement("div");
  documentHost.className = "anyfile-word-viewer__document";
  const generatedStyles = document.createElement("div");
  generatedStyles.className = "anyfile-word-viewer__generated-styles";
  root.append(style, toolbar, generatedStyles, documentHost);
  return { documentHost, generatedStyles, root };
}

function secureDocumentLinks(root: HTMLElement) {
  for (const link of root.querySelectorAll("a")) {
    const href = link.getAttribute("href")?.trim();
    if (href && !href.startsWith("#")) {
      try {
        const protocol = new URL(href, window.location.href).protocol;
        if (!["http:", "https:", "mailto:", "tel:"].includes(protocol)) link.removeAttribute("href");
      } catch {
        link.removeAttribute("href");
      }
    }
    link.rel = "noreferrer noopener";
  }
}

async function openWord(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = getCopy(context.locale);
  const { documentHost, generatedStyles, root } = createViewerRoot(file.name);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
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
    await renderAsync(bytes, documentHost, generatedStyles, {
      breakPages: true,
      className: "anyfile-docx",
      ignoreLastRenderedPageBreak: false,
      renderAltChunks: false,
      renderChanges: false,
      renderComments: false,
      useBase64URL: false,
    });
    if (signal.aborted) throw abortError();
    secureDocumentLinks(root);
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

export const wordViewer: FileViewerPlugin = {
  manifest: wordManifest,
  open: openWord,
};

export { wordManifest } from "./manifest";
