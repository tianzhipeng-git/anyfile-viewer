import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { bittorrentManifest } from "./manifest";
import { readTorrent } from "./parse";
import { createTorrentView } from "./ui";

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function openTorrent(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportPreview, reportProgress, signal } = context;
  const copy = selectMessages(locale, {
    en: { reading: "Reading torrent file…", rendering: "Preparing torrent metadata…", ready: "Torrent file opened", invalid: "The file is damaged or is not a valid torrent file." },
    "zh-CN": { reading: "正在读取种子文件…", rendering: "正在整理种子元数据…", ready: "种子文件已打开", invalid: "文件已损坏，或不是有效的种子文件。" },
  });
  let view: ReturnType<typeof createTorrentView> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    view?.dispose();
  };

  try {
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const document = await readTorrent(file, signal, reportProgress, locale);
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "rendering", message: copy.rendering });
    view = createTorrentView(file.name, document, locale);
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

export const bittorrentViewer: FileViewerPlugin = { manifest: bittorrentManifest, open: openTorrent };
export { bittorrentManifest } from "./manifest";
