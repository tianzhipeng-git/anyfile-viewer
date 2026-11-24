import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
  abortError,
} from "@anyfile/viewer-protocol";

import { plistManifest } from "./manifest";
import { readPlist } from "./parse";
import { PlistError } from "./types";
import { createPlistView } from "./ui";

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function openPlist(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportPreview, reportProgress, signal } = context;
  const copy = selectMessages(locale, {
    en: {
      reading: "Reading property list…",
      rendering: "Preparing property list…",
      ready: "Property list opened",
      invalid: "The file is damaged or is not a valid property list.",
      limit: "The property list is too large to open.",
    },
    "zh-CN": {
      reading: "正在读取属性列表…",
      rendering: "正在整理属性列表…",
      ready: "属性列表已打开",
      invalid: "文件已损坏，或不是有效的属性列表。",
      limit: "属性列表过大，无法打开。",
    },
  });
  let view: ReturnType<typeof createPlistView> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    view?.dispose();
  };

  try {
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const document = await readPlist(file, signal);
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "rendering", message: copy.rendering });
    view = createPlistView(file.name, document, locale);
    if (signal.aborted) throw abortError();
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready, loaded: file.size, total: file.size });
    reportPreview?.({ outcome: "success", kind: "structure" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || isAbortError(error)) throw error;
    if (error instanceof PlistError) {
      const message = error.code === "resource-limit" ? copy.limit : copy.invalid;
      throw new ViewerError(error.code, message, { cause: error });
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const plistViewer: FileViewerPlugin = { manifest: plistManifest, open: openPlist };
export { plistManifest } from "./manifest";
