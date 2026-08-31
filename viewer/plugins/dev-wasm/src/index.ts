import { ViewerError, selectMessages, type FileViewerPlugin, type OpenViewerContext } from "@anyfile/viewer-protocol";

import { devWasmManifest } from "./manifest";
import { parseWasm } from "./parser";
import { createWasmView } from "./ui";

async function openWasm(context: OpenViewerContext) {
  const { container, file, reportProgress, signal } = context;
  const copy = selectMessages(context.locale, { "zh-CN": {
    parsing: "正在解析 WebAssembly 结构…", ready: "WebAssembly 模块已打开", invalid: "文件不是有效的 WebAssembly 模块。",
  }, en: {
    parsing: "Parsing WebAssembly structure…", ready: "WebAssembly module opened", invalid: "The file is not a valid WebAssembly module.",
  } });
  let root: HTMLElement | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    root?.remove();
  };
  try {
    reportProgress({ stage: "parsing", message: copy.parsing });
    const wasmModule = await parseWasm(file, signal);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    root = createWasmView(file.name, wasmModule, context.locale);
    container.append(root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ViewerError(error instanceof ViewerError ? error.code : "invalid-file", copy.invalid, { cause: error });
  }
}

export const devWasmViewer: FileViewerPlugin = { manifest: devWasmManifest, open: openWasm };
export { devWasmManifest } from "./manifest";
