import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { devArrayManifest } from "./manifest";
import { openNpzEntry, readNpzEntries } from "./npz";
import { FileByteSource } from "./source";
import { createArrayView, type ArrayChoice } from "./ui";

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function choicesFor(context: OpenViewerContext): Promise<readonly ArrayChoice[]> {
  const { file, signal } = context;
  if (file.name.toLowerCase().endsWith(".npy")) {
    return [{ name: file.name, size: file.size, async open() { return new FileByteSource(file, signal); } }];
  }
  if (!file.name.toLowerCase().endsWith(".npz")) {
    throw new ViewerError("invalid-file", "文件不是 NPY 或 NPZ。 ");
  }
  const entries = await readNpzEntries(file, signal);
  return entries.map((entry) => ({
    name: entry.name,
    size: entry.uncompressedSize,
    compressedSize: entry.compressedSize,
    open: () => openNpzEntry(file, entry, signal),
  }));
}

async function openArray(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  let view: Awaited<ReturnType<typeof createArrayView>> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", abort);
    view?.dispose();
  };
  const abort = () => dispose();
  try {
    if (signal.aborted) throw abortError();
    if (file.size === 0) throw new ViewerError("invalid-file", "空文件不包含 NumPy 数组。");
    reportProgress({ stage: "indexing", message: "正在读取数组索引…" });
    const choices = await choicesFor(context);
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "reading", message: "正在读取首个数组页…" });
    view = await createArrayView(file.name, choices, context.locale, signal);
    if (signal.aborted) throw abortError();
    container.append(view.root);
    signal.addEventListener("abort", abort, { once: true });
    reportProgress({ stage: "ready", message: "NumPy 数组已打开" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", "文件已损坏，或不是受支持的 NumPy 数组。", { cause: error });
  }
}

export const devArrayViewer: FileViewerPlugin = {
  manifest: devArrayManifest,
  open: openArray,
};

export { devArrayManifest } from "./manifest";
