import { ViewerError, type FileViewerPlugin, type OpenViewerContext } from "@anyfile/viewer-protocol";

import { devSourceMapManifest } from "./manifest";
import { parseSourceMap } from "./parser";
import { createSourceMapView } from "./ui";

async function openSourceMap(context: OpenViewerContext) {
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
    reportProgress({ stage: "parsing", message: "正在解析 source map…" });
    const document = await parseSourceMap(file, signal);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    root = createSourceMapView(file.name, document);
    container.append(root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: "Source map 已打开" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", "文件不是有效的 ECMA-426 source map。", { cause: error });
  }
}

export const devSourceMapViewer: FileViewerPlugin = { manifest: devSourceMapManifest, open: openSourceMap };
export { devSourceMapManifest } from "./manifest";
