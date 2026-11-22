import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { mlWeightsManifest } from "./manifest";
import { readModel } from "./parse";
import { createModelView } from "./ui";

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function openModel(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportPreview, reportProgress, signal } = context;
  const copy = selectMessages(locale, {
    en: { reading: "Reading model weights…", rendering: "Preparing tensor list…", ready: "Model weights opened", invalid: "The file is damaged or is not a valid safetensors/GGUF model." },
    "zh-CN": { reading: "正在读取模型权重…", rendering: "正在整理张量清单…", ready: "模型权重已打开", invalid: "文件已损坏，或不是有效的 safetensors/GGUF 模型。" },
  });
  let view: ReturnType<typeof createModelView> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    view?.dispose();
  };

  try {
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const document = await readModel(file, signal, reportProgress, locale);
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "rendering", message: copy.rendering });
    view = createModelView(document, locale);
    if (signal.aborted) throw abortError();
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    reportPreview?.({ outcome: "success", kind: "structure" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || isAbortError(error)) throw error;
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const mlWeightsViewer: FileViewerPlugin = { manifest: mlWeightsManifest, open: openModel };
export { mlWeightsManifest } from "./manifest";
