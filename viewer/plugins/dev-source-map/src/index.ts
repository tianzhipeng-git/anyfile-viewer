import { ViewerError, selectMessages, type FileViewerPlugin, type OpenViewerContext } from "@anyfile/viewer-protocol";

import { devSourceMapManifest } from "./manifest";
import { parseSourceMap } from "./parser";
import { createSourceMapView } from "./ui";

async function openSourceMap(context: OpenViewerContext) {
  const { container, file, reportProgress, signal } = context;
  const copy = selectMessages(context.locale, { "zh-CN": {
    parsing: "正在解析 source map…", ready: "Source map 已打开", invalid: "文件不是有效的 ECMA-426 source map。",
  }, en: {
    parsing: "Parsing source map…", ready: "Source map opened", invalid: "The file is not a valid ECMA-426 source map.",
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
    const document = await parseSourceMap(file, signal);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    root = createSourceMapView(file.name, document, context.locale);
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

export const devSourceMapViewer: FileViewerPlugin = { manifest: devSourceMapManifest, open: openSourceMap };
export { devSourceMapManifest } from "./manifest";
