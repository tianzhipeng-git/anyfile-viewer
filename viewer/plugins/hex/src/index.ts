import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { hexManifest } from "./manifest";

const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 32;
const OVERSCAN_ROWS = 5;
const DEFAULT_VIEWPORT_HEIGHT = 480;
const MAX_VIRTUAL_HEIGHT = 8_000_000;

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function readRange(file: File, start: number, end: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const reader = file.slice(start, end).stream().getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      length += result.value.byteLength;
    }
    if (signal.aborted) throw abortError();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function formatHex(bytes: Uint8Array) {
  const cells = Array.from({ length: BYTES_PER_ROW }, (_, index) => (
    index < bytes.length ? bytes[index].toString(16).padStart(2, "0").toUpperCase() : "  "
  ));
  return `${cells.slice(0, 8).join(" ")}  ${cells.slice(8).join(" ")}`;
}

function formatText(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "·").join("");
}

function createGridRow(offset: number, bytes: Uint8Array, addressDigits: number) {
  const row = document.createElement("div");
  row.className = "anyfile-hex-viewer__row";
  row.dataset.offset = String(offset);

  const address = document.createElement("span");
  address.className = "anyfile-hex-viewer__offset";
  address.textContent = offset.toString(16).padStart(addressDigits, "0").toUpperCase();

  const hex = document.createElement("span");
  hex.className = "anyfile-hex-viewer__hex";
  hex.textContent = formatHex(bytes);

  const text = document.createElement("span");
  text.className = "anyfile-hex-viewer__text";
  text.textContent = formatText(bytes);

  row.append(address, hex, text);
  return row;
}

function installStyles(root: HTMLElement) {
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-hex-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; font-size:13px; line-height:1; }
    .anyfile-hex-viewer__viewport { min-height:0; flex:1; overflow:auto; }
    .anyfile-hex-viewer__surface { position:relative; min-width:max-content; width:100%; }
    .anyfile-hex-viewer__header, .anyfile-hex-viewer__row { box-sizing:border-box; display:grid; grid-template-columns:var(--anyfile-hex-offset-width) 51ch minmax(16ch,1fr); min-width:max-content; width:100%; }
    .anyfile-hex-viewer__header { position:sticky; top:0; z-index:2; height:${HEADER_HEIGHT}px; align-items:center; border-bottom:1px solid var(--viewer-border,#ddd); background:color-mix(in srgb,var(--viewer-background,#fff) 94%,var(--viewer-foreground,#111)); color:color-mix(in srgb,var(--viewer-foreground,#111) 58%,transparent); font-weight:600; }
    .anyfile-hex-viewer__rows { position:absolute; inset-inline:0; top:0; }
    .anyfile-hex-viewer__row { height:${ROW_HEIGHT}px; align-items:center; }
    .anyfile-hex-viewer__row:hover { background:color-mix(in srgb,var(--viewer-accent,#2563eb) 8%,transparent); }
    .anyfile-hex-viewer__offset, .anyfile-hex-viewer__hex, .anyfile-hex-viewer__text, .anyfile-hex-viewer__header > span { box-sizing:border-box; height:100%; display:flex; align-items:center; white-space:pre; }
    .anyfile-hex-viewer__offset, .anyfile-hex-viewer__header > span:first-child { justify-content:flex-end; padding:0 16px; color:color-mix(in srgb,var(--viewer-foreground,#111) 52%,transparent); user-select:none; }
    .anyfile-hex-viewer__hex, .anyfile-hex-viewer__header > span:nth-child(2) { padding:0 14px; border-inline:1px solid var(--viewer-border,#ddd); }
    .anyfile-hex-viewer__text, .anyfile-hex-viewer__header > span:last-child { padding:0 14px; }
    .anyfile-hex-viewer__empty, .anyfile-hex-viewer__error { position:sticky; left:0; display:grid; min-height:180px; place-items:center; padding:24px; color:color-mix(in srgb,var(--viewer-foreground,#111) 55%,transparent); font-family:var(--viewer-font-family,system-ui); }
    .anyfile-hex-viewer__error { color:#b42318; }
  `;
  root.append(style);
}

function createHeader(locale: string) {
  const chinese = locale.toLowerCase().startsWith("zh");
  const header = document.createElement("div");
  header.className = "anyfile-hex-viewer__header";
  const address = document.createElement("span");
  address.textContent = chinese ? "位置" : "OFFSET";
  const hex = document.createElement("span");
  hex.textContent = `${Array.from({ length: 8 }, (_, index) => index.toString(16).toUpperCase().padStart(2, "0")).join(" ")}  ${Array.from({ length: 8 }, (_, index) => (index + 8).toString(16).toUpperCase()).join(" ")}`;
  const text = document.createElement("span");
  text.textContent = chinese ? "文本" : "TEXT";
  header.append(address, hex, text);
  return header;
}

async function openHex(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportProgress, signal } = context;
  const chinese = locale.toLowerCase().startsWith("zh");
  const root = document.createElement("div");
  root.className = "anyfile-hex-viewer";
  const addressDigits = Math.max(8, Math.ceil(Math.log2(Math.max(file.size, 1)) / 4));
  root.style.setProperty("--anyfile-hex-offset-width", `${addressDigits + 4}ch`);
  installStyles(root);

  const viewport = document.createElement("div");
  viewport.className = "anyfile-hex-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", chinese ? "十六进制文件内容" : "Hexadecimal file content");
  const surface = document.createElement("div");
  surface.className = "anyfile-hex-viewer__surface";
  const header = createHeader(locale);
  const rows = document.createElement("div");
  rows.className = "anyfile-hex-viewer__rows";
  surface.append(header, rows);
  viewport.append(surface);
  root.append(viewport);
  container.append(root);

  const rowCount = Math.ceil(file.size / BYTES_PER_ROW);
  let disposed = false;
  let renderAbort: AbortController | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderAbort?.abort();
    viewport.removeEventListener("scroll", handleScroll);
    resizeObserver?.disconnect();
    signal.removeEventListener("abort", dispose);
    root.remove();
  };

  const renderVisibleRows = async () => {
    if (disposed || signal.aborted) return;
    renderAbort?.abort();
    const currentAbort = new AbortController();
    renderAbort = currentAbort;

    if (rowCount === 0) {
      surface.style.height = `${HEADER_HEIGHT + 180}px`;
      rows.style.transform = `translateY(${HEADER_HEIGHT}px)`;
      const empty = document.createElement("div");
      empty.className = "anyfile-hex-viewer__empty";
      empty.textContent = chinese ? "这是一个空文件" : "This file is empty";
      rows.replaceChildren(empty);
      return;
    }

    const viewportHeight = Math.max(viewport.clientHeight || DEFAULT_VIEWPORT_HEIGHT, ROW_HEIGHT);
    const visibleRows = Math.max(1, Math.ceil((viewportHeight - HEADER_HEIGHT) / ROW_HEIGHT));
    const fullBodyHeight = rowCount * ROW_HEIGHT;
    const virtualBodyHeight = Math.min(fullBodyHeight, MAX_VIRTUAL_HEIGHT);
    const virtualHeight = HEADER_HEIGHT + virtualBodyHeight;
    surface.style.height = `${virtualHeight}px`;

    const maxScrollTop = Math.max(virtualHeight - viewportHeight, 0);
    const maxFirstVisibleRow = Math.max(rowCount - visibleRows, 0);
    const scaled = fullBodyHeight > MAX_VIRTUAL_HEIGHT;
    const scrollProgress = maxScrollTop === 0 ? 0 : Math.min(viewport.scrollTop / maxScrollTop, 1);
    const firstVisibleRow = scaled
      ? Math.round(scrollProgress * maxFirstVisibleRow)
      : Math.min(Math.floor(viewport.scrollTop / ROW_HEIGHT), maxFirstVisibleRow);
    const firstRow = Math.max(0, firstVisibleRow - OVERSCAN_ROWS);
    const rowsToRead = Math.min(visibleRows + OVERSCAN_ROWS * 2, rowCount - firstRow);
    const start = firstRow * BYTES_PER_ROW;
    const end = Math.min(file.size, start + rowsToRead * BYTES_PER_ROW);
    const layerTop = scaled
      ? viewport.scrollTop + HEADER_HEIGHT - (firstVisibleRow - firstRow) * ROW_HEIGHT
      : HEADER_HEIGHT + firstRow * ROW_HEIGHT;

    try {
      const bytes = await readRange(file, start, end, currentAbort.signal);
      if (disposed || currentAbort.signal.aborted || signal.aborted) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < rowsToRead; index += 1) {
        const rowBytes = bytes.subarray(index * BYTES_PER_ROW, (index + 1) * BYTES_PER_ROW);
        fragment.append(createGridRow(start + index * BYTES_PER_ROW, rowBytes, addressDigits));
      }
      rows.style.transform = `translateY(${layerTop}px)`;
      rows.replaceChildren(fragment);
    } catch {
      if (disposed || currentAbort.signal.aborted || signal.aborted) return;
      const message = document.createElement("div");
      message.className = "anyfile-hex-viewer__error";
      message.setAttribute("role", "alert");
      message.textContent = chinese ? "无法读取这个文件区域。" : "Unable to read this part of the file.";
      rows.style.transform = `translateY(${viewport.scrollTop + HEADER_HEIGHT}px)`;
      rows.replaceChildren(message);
    }
  };

  function handleScroll() {
    void renderVisibleRows();
  }

  try {
    signal.addEventListener("abort", dispose, { once: true });
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => void renderVisibleRows());
      resizeObserver.observe(viewport);
    }
    reportProgress({
      stage: "reading",
      message: chinese ? "正在读取文件首屏…" : "Reading the first screen…",
      loaded: 0,
      total: file.size,
    });
    await renderVisibleRows();
    if (signal.aborted) throw abortError();
    reportProgress({
      stage: "ready",
      message: chinese ? "十六进制预览已打开" : "Hex preview opened",
    });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ViewerError("open-failed", chinese ? "无法打开十六进制预览。" : "Unable to open the hex preview.", { cause: error });
  }
}

export const hexViewer: FileViewerPlugin = { manifest: hexManifest, open: openHex };
export { hexManifest } from "./manifest";
