import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
  abortError,
} from "@anyfile/viewer-protocol";

import { fontManifest } from "./manifest";
import { readFont } from "./metadata";
import { inspectFont } from "./probe";
import { createFontView, type FontView } from "./ui";

/** FontFace needs the whole file in memory, so large CJK or emoji collections stay out. */
const MAX_FILE_BYTES = 32 * 1024 * 1024;
let sequence = 0;

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function openFont(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportProgress, signal } = context;
  const copy = selectMessages(locale, {
    en: {
      reading: "Reading font file…",
      rendering: "Rendering type specimen…",
      ready: "Font opened",
      invalid: "The file is damaged or is not a valid font.",
      tooLarge: "This font is larger than the 32 MiB preview limit.",
      unsupported: "This browser cannot render local font files.",
    },
    "zh-CN": {
      reading: "正在读取字体文件…",
      rendering: "正在生成字体预览…",
      ready: "字体已打开",
      invalid: "文件已损坏，或内容不是有效的字体。",
      tooLarge: "该字体超过 32 MiB 的预览上限。",
      unsupported: "当前浏览器无法渲染本地字体文件。",
    },
  });
  let view: FontView | undefined;
  let face: FontFace | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (face) document.fonts.delete(face);
    view?.dispose();
  };

  try {
    if (file.size > MAX_FILE_BYTES) throw new ViewerError("resource-limit", copy.tooLarge);
    if (typeof FontFace === "undefined") throw new ViewerError("unsupported-environment", copy.unsupported);
    const probe = await inspectFont(context);
    if (!probe) throw new ViewerError("invalid-file", copy.invalid);

    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const buffer = await file.arrayBuffer();
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "rendering", message: copy.rendering });

    const font = await readFont(new Uint8Array(buffer), file.size);
    if (signal.aborted) throw abortError();
    face = new FontFace(`anyfile-font-${++sequence}`, buffer);
    await face.load();
    if (signal.aborted) throw abortError();
    document.fonts.add(face);
    view = createFontView({
      family: face.family,
      container: probe.container,
      fileSize: file.size,
      metadata: font.metadata,
      tables: font.tables,
      locale,
    });
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || isAbortError(error)) throw error;
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const fontViewer: FileViewerPlugin = { manifest: fontManifest, open: openFont };
export { fontManifest } from "./manifest";
