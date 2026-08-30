import { ViewerError, type FileViewerPlugin, type OpenViewerContext } from "@anyfile/viewer-protocol";

import { devWasmManifest } from "./manifest";
import { parseWasm } from "./parser";
import { createWasmView } from "./ui";

async function openWasm(context: OpenViewerContext) {
  const { container, file, reportProgress, signal } = context;
  let root: HTMLElement | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    root?.remove();
  };
  try {
    reportProgress({ stage: "parsing", message: "正在解析 WebAssembly 结构…" });
    const wasmModule = await parseWasm(file, signal);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    root = createWasmView(file.name, wasmModule);
    container.append(root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: "WebAssembly 模块已打开" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", "文件不是有效的 WebAssembly 模块。", { cause: error });
  }
}

export const devWasmViewer: FileViewerPlugin = { manifest: devWasmManifest, open: openWasm };
export { devWasmManifest } from "./manifest";
