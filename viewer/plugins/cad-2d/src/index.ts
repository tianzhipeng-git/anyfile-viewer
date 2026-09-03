import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { cad2dManifest } from "./manifest";
import { abortError, CAD_INPUT_LIMIT, readDxfText } from "./read";
import { parseCadScene } from "./scene";
import { createCadViewerElements, type CadViewerElements } from "./ui";
import { Cad2dViewport } from "./viewport";

function copyFor(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, {
    "zh-CN": {
      reading: "正在读取 DXF 工程图…",
      parsing: "正在解析 DXF 图元…",
      rendering: "正在渲染 CAD 工程图…",
      ready: "DXF 工程图已打开",
      invalid: "文件内容不是有效或完整的 DXF 工程图。",
      limit: `DXF 文件大小不能超过 ${CAD_INPUT_LIMIT / 1024 / 1024} MiB。`,
      unsupported: "当前浏览器缺少 Canvas 2D 能力。",
    },
    en: {
      reading: "Reading DXF drawing…",
      parsing: "Parsing DXF entities…",
      rendering: "Rendering CAD drawing…",
      ready: "DXF drawing opened",
      invalid: "The file is not a valid, complete DXF drawing.",
      limit: `DXF input must not exceed ${CAD_INPUT_LIMIT / 1024 / 1024} MiB.`,
      unsupported: "This browser lacks Canvas 2D support.",
    },
  });
}

async function openCad2d(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal, locale } = context;
  const copy = copyFor(locale);
  let root: HTMLDivElement | undefined;
  let elements: CadViewerElements | undefined;
  let viewport: Cad2dViewport | undefined;
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
    const scene = parseCadScene(source);
    if (!scene) throw new ViewerError("invalid-file", copy.invalid);
    if (signal.aborted) throw abortError();

    reportProgress({ stage: "rendering", message: copy.rendering });
    elements = createCadViewerElements(file.name, scene, locale);
    root = elements.root;
    container.append(root);
    viewport = new Cad2dViewport(elements, scene);
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
    if (error instanceof Error && error.message === "Canvas 2D is unavailable.") {
      throw new ViewerError("unsupported-environment", copy.unsupported, { cause: error });
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const cad2dViewer: FileViewerPlugin = {
  manifest: cad2dManifest,
  open: openCad2d,
};

export { cad2dManifest } from "./manifest";
