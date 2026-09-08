import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { cad2dManifest } from "./manifest";
import { abortError, CAD_INPUT_LIMIT, readDxfText } from "./read";
import { readCadScene } from "./parse";
import { create3dViewer } from "@anyfile/rendering-3d";
import { cadDocument } from "./adapter-3d";

function copyFor(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, {
    "zh-CN": {
      reading: "正在读取 DXF 工程图…",
      parsing: "正在解析 DXF 图元…",
      rendering: "正在渲染 CAD 工程图…",
      ready: "DXF 工程图已打开",
      invalid: "文件内容不是有效或完整的 DXF 工程图。",
      limit: `DXF 文件大小不能超过 ${CAD_INPUT_LIMIT / 1024 / 1024} MiB。`,
    },
    en: {
      reading: "Reading DXF drawing…",
      parsing: "Parsing DXF entities…",
      rendering: "Rendering CAD drawing…",
      ready: "DXF drawing opened",
      invalid: "The file is not a valid, complete DXF drawing.",
      limit: `DXF input must not exceed ${CAD_INPUT_LIMIT / 1024 / 1024} MiB.`,
    },
  });
}

async function openCad2d(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal, locale } = context;
  const copy = copyFor(locale);
  let root: HTMLDivElement | undefined;
  let viewport: ReturnType<typeof create3dViewer> | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    viewport?.dispose();
    viewport = undefined;
    root?.remove();
    root = undefined;
  };

  try {
    if (signal.aborted) throw abortError();
    if (file.size === 0) throw new ViewerError("invalid-file", copy.invalid);

    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const source = await readDxfText(file, signal);
    if (signal.aborted) throw abortError();

    reportProgress({ stage: "parsing", message: copy.parsing, loaded: file.size, total: file.size });
    const scene = await readCadScene(source, signal);
    if (!scene) throw new ViewerError("invalid-file", copy.invalid);
    if (signal.aborted) throw abortError();

    reportProgress({ stage: "rendering", message: copy.rendering });
    viewport = create3dViewer(container, cadDocument(scene), locale, file.name);
    root = viewport.root;
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) {
      throw error;
    }
    if (error instanceof RangeError) {
      throw new ViewerError("resource-limit", copy.limit, { cause: error });
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const cad2dViewer: FileViewerPlugin = {
  manifest: cad2dManifest,
  open: openCad2d,
};

export { cad2dManifest } from "./manifest";
