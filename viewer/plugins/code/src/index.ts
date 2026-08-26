import ace from "ace-builds";
import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { codeManifest } from "./manifest";
import { modeForFileName, type AceMode } from "./modes";

const MAX_FILE_BYTES = 256 * 1024 * 1024;
const aceModeModules: Partial<Record<AceMode, () => Promise<unknown>>> = {};

function modeModule(mode: AceMode) {
  return aceModeModules[mode] ??= () => import(`ace-builds/src-noconflict/mode-${mode}.js`);
}

async function readText(file: File, signal: AbortSignal) {
  if (file.size > MAX_FILE_BYTES) {
    throw new ViewerError("resource-limit", "文件超过 256 MB，浏览器无法安全预览。", { cause: file.size });
  }
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(decoder.decode(result.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    return chunks.join("");
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-code-viewer { min-height:100%; width:100%; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); }
    .anyfile-code-viewer .ace_editor { position:relative; width:100%; height:100%; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; }
    .anyfile-code-viewer .ace_gutter { background:color-mix(in srgb,var(--viewer-background,#fff) 92%,var(--viewer-foreground,#111)); color:color-mix(in srgb,var(--viewer-foreground,#111) 45%,transparent); }
    .anyfile-code-viewer .ace_gutter-cell { padding-left:16px; padding-right:12px; }
    .anyfile-code-viewer .ace_scroller { background:var(--viewer-background,#fff); }
    .anyfile-code-viewer .ace_cursor { display:none; }
    .anyfile-code-viewer .ace_selection { background:color-mix(in srgb,var(--viewer-accent,#2563eb) 22%,transparent); }
    .anyfile-code-viewer .ace_search { background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); border:1px solid var(--viewer-border,#ddd); }
  `;
  document.head.append(style);
  return () => style.remove();
}

async function openCode(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportProgress, signal } = context;
  const root = document.createElement("div");
  root.className = "anyfile-code-viewer";
  root.style.height = "100%";
  let editor: ace.Ace.Editor | undefined;
  const removeStyles = installStyles();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    editor?.destroy();
    editor = undefined;
    root.remove();
    removeStyles();
  };
  try {
    reportProgress({ stage: "reading", message: locale.toLowerCase().startsWith("zh") ? "正在读取文本…" : "Reading text…", total: file.size });
    const text = await readText(file, signal);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    const mode = modeForFileName(file.name);
    reportProgress({ stage: "loading", message: `正在加载 ${mode}…` });
    await import("ace-builds/src-noconflict/ext-searchbox");
    await modeModule(mode)();
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    container.replaceChildren(root);
    editor = ace.edit(root);
    editor.setValue(text, -1);
    editor.setReadOnly(true);
    editor.setOption("showPrintMargin", false);
    editor.setOption("highlightActiveLine", false);
    editor.setOption("highlightSelectedWord", false);
    editor.setOption("wrap", false);
    editor.setOption("displayIndentGuides", false);
    editor.setOption("useWorker", false);
    editor.session.setMode(`ace/mode/${mode}`);
    editor.session.setUseWrapMode(false);
    editor.renderer.setScrollMargin(8, 8, 0, 0);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: locale.toLowerCase().startsWith("zh") ? "代码文件已打开" : "Code file opened" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("open-failed", "无法打开代码或文本文件。", { cause: error });
  }
}

export const codeViewer: FileViewerPlugin = { manifest: codeManifest, open: openCode };
export { codeManifest } from "./manifest";
export { modeForFileName } from "./modes";
