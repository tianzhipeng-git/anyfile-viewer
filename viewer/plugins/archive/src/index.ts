import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { archiveMetadataManifest } from "./manifest";
import { identifyArchive, parseArchive } from "./parse";
import { RangeReader } from "./range-reader";
import { createArchiveView } from "./ui";

async function openArchive(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = selectMessages(context.locale, { "zh-CN": {
    empty: "空文件不包含可读取的归档元数据。", reading: "正在识别压缩格式…", ready: "归档元数据已打开",
    invalid: "文件已损坏，或不是受支持的压缩格式。", limit: "归档元数据超过浏览器安全上限。",
    unsupported: "当前浏览器不支持处理这个归档格式。",
  }, en: {
    empty: "An empty file does not contain readable archive metadata.", reading: "Identifying archive format…", ready: "Archive metadata opened",
    invalid: "The file is damaged or is not a supported archive format.", limit: "The archive metadata exceeds browser safety limits.",
    unsupported: "This browser cannot process this archive format.",
  } });
  const reader = new RangeReader(file, signal);
  let view: ReturnType<typeof createArchiveView> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", abort);
    view?.dispose();
  };
  const abort = () => dispose();
  try {
    if (file.size === 0) throw new ViewerError("invalid-file", copy.empty);
    reportProgress({ stage: "reading", message: copy.reading });
    const format = await identifyArchive(file, reader);
    reportProgress({ stage: "parsing", message: selectMessages(context.locale, { en: "Reading archive metadata…", "zh-CN": "正在读取归档元数据…" }) });
    const metadata = await parseArchive(file, reader, format, signal);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    view = createArchiveView(file.name, metadata, context.locale);
    container.append(view.root);
    signal.addEventListener("abort", abort, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const code = error instanceof ViewerError ? error.code : "invalid-file";
    const fallback = code === "resource-limit" ? copy.limit : code === "unsupported-environment" ? copy.unsupported : copy.invalid;
    const message = selectMessages(context.locale, {
      en: fallback,
      "zh-CN": error instanceof ViewerError ? error.message : fallback,
    });
    throw new ViewerError(code, message, { cause: error });
  }
}

export const archiveMetadataViewer: FileViewerPlugin = {
  manifest: archiveMetadataManifest,
  open: openArchive,
};

export { archiveMetadataManifest } from "./manifest";
export { RangeReader } from "./range-reader";
