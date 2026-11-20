import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
} from "@anyfile/viewer-protocol";

import { devNativeBinaryManifest } from "./manifest";
import { parseNativeBinary } from "./parser";
import { createNativeBinaryView } from "./ui";

async function openNativeBinary(context: OpenViewerContext) {
  const { container, file, reportProgress, reportPreview, signal } = context;
  const copy = selectMessages(context.locale, {
    "zh-CN": {
      parsing: "正在解析原生二进制结构…",
      ready: "原生二进制结构已打开",
      invalid: "文件不是受支持的原生二进制或归档格式。",
      limit: "原生二进制结构超出浏览器安全解析上限。",
    },
    en: {
      parsing: "Parsing native binary structure…",
      ready: "Native binary structure opened",
      invalid: "The file is not a supported native binary or archive format.",
      limit: "The native binary structure exceeds browser safety limits.",
    },
  });

  let root: HTMLElement | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    root?.remove();
    root = undefined;
  };

  try {
    reportProgress({ stage: "parsing", message: copy.parsing });
    const report = await parseNativeBinary(file, signal);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    root = createNativeBinaryView(file.name, report, context.locale);
    container.append(root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    reportPreview?.({ outcome: "success", kind: "structure" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const code = error instanceof ViewerError ? error.code : "invalid-file";
    const message = code === "resource-limit" ? copy.limit : copy.invalid;
    throw new ViewerError(code, message, { cause: error });
  }
}

export const devNativeBinaryViewer: FileViewerPlugin = {
  manifest: devNativeBinaryManifest,
  open: openNativeBinary,
};
export { devNativeBinaryManifest } from "./manifest";
