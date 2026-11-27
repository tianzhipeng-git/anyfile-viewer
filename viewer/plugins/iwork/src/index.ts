import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
  abortError,
} from "@anyfile/viewer-protocol";
import type { InspectorShell } from "@anyfile/viewer-ui";

import { IwaLimitError } from "./iwa";
import { detectIworkLayout, iworkAppFromName, previewPath } from "./layout";
import { buildIworkModel } from "./load";
import { iworkManifest } from "./manifest";
import type { IworkModel } from "./model";
import { IWORK_LIMITS, IworkPackage, PackageEncryptedError, PackageLimitError } from "./package";
import { renderIwork } from "./ui";

const MAX_INPUT_BYTES = 1024 * 1024 * 1024;

const messages = {
  en: {
    reading: "Reading iWork package…", parsing: "Extracting document text…", ready: "iWork document opened",
    invalid: "The file is not a readable Pages or Keynote document.",
    limit: "The iWork document exceeds browser safety limits.",
    encrypted: "Password-protected Pages and Keynote documents are not supported.",
    unsupported: "This browser cannot decompress the iWork package.",
    pages: "Apple Pages document", keynote: "Apple Keynote presentation", modern: "iWork 2013+", legacy: "iWork '09",
    slides: (count: number) => `${count} ${count === 1 ? "slide" : "slides"}`,
    paragraphs: (count: number) => `${count} ${count === 1 ? "paragraph" : "paragraphs"}`,
    preview: "Saved preview", body: "Document text", textBoxes: "Text boxes", slide: (index: number) => `Slide ${index}`,
    notes: "Presenter notes", emptySlide: "No text on this slide.", noText: "No text was found in this document.",
    limitation: "Text and saved thumbnails only: layout, fonts, tables, charts and embedded media are not rendered.",
  },
  "zh-CN": {
    reading: "正在读取 iWork 文档包…", parsing: "正在提取文档文本…", ready: "iWork 文档已打开",
    invalid: "文件不是可读取的 Pages 或 Keynote 文档。",
    limit: "iWork 文档超过浏览器安全资源上限。",
    encrypted: "暂不支持带密码保护的 Pages 和 Keynote 文档。",
    unsupported: "当前浏览器无法解压 iWork 文档包。",
    pages: "Apple Pages 文稿", keynote: "Apple Keynote 演示文稿", modern: "iWork 2013+", legacy: "iWork '09",
    slides: (count: number) => `${count} 张幻灯片`,
    paragraphs: (count: number) => `${count} 个段落`,
    preview: "保存时的预览图", body: "正文", textBoxes: "文本框", slide: (index: number) => `第 ${index} 张幻灯片`,
    notes: "演讲者备注", emptySlide: "此幻灯片没有文本。", noText: "文档中没有找到文本。",
    limitation: "仅显示文本与保存时的缩略图：不还原版式、字体、表格、图表和嵌入媒体。",
  },
};

function imageType(path: string) {
  return path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function extractImages(pkg: IworkPackage, model: IworkModel, preview: string | undefined, urls: string[]) {
  const paths = new Set(model.sections.flatMap((section) => (section.image ? [section.image] : [])));
  if (preview) paths.add(preview);
  const images = new Map<string, string>();
  let budget = IWORK_LIMITS.imageBytes;
  for (const path of paths) {
    const size = pkg.size(path);
    if (size === undefined || size > budget) continue;
    budget -= size;
    try {
      const url = URL.createObjectURL(await pkg.blob(path, size, imageType(path)));
      urls.push(url);
      images.set(path, url);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      // A broken thumbnail only hides that image; the extracted text stays usable.
    }
  }
  return images;
}

async function openIwork(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = selectMessages(context.locale, messages);
  const urls: string[] = [];
  let shell: InspectorShell | undefined;
  let pkg: IworkPackage | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    shell?.dispose();
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  };

  try {
    if (signal.aborted) throw abortError();
    const app = iworkAppFromName(file.name);
    if (!app) throw new ViewerError("invalid-file", copy.invalid);
    if (file.size > MAX_INPUT_BYTES) throw new ViewerError("resource-limit", copy.limit);
    if (typeof DecompressionStream === "undefined") throw new ViewerError("unsupported-environment", copy.unsupported);
    reportProgress({ stage: "reading", message: copy.reading });
    pkg = await IworkPackage.open(file, signal);
    const layout = detectIworkLayout(pkg.names, app);
    if (!layout) throw new ViewerError("invalid-file", copy.invalid);
    if (layout.kind === "encrypted") throw new ViewerError("open-failed", copy.encrypted);
    reportProgress({ stage: "parsing", message: copy.parsing });
    const model = await buildIworkModel(pkg, layout, app, signal);
    const preview = previewPath(pkg.names, layout.prefix);
    const images = await extractImages(pkg, model, preview, urls);
    if (signal.aborted) throw abortError();
    shell = renderIwork(file.name, model, preview ? images.get(preview) : undefined, images, copy);
    container.append(shell.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    context.reportPreview?.({ outcome: "success", kind: "static" });
    return { dispose };
  } catch (error) {
    dispose();
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw abortError();
    if (error instanceof ViewerError) throw error;
    if (error instanceof PackageEncryptedError) throw new ViewerError("open-failed", copy.encrypted, { cause: error });
    if (error instanceof PackageLimitError || error instanceof IwaLimitError) {
      throw new ViewerError("resource-limit", copy.limit, { cause: error });
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  } finally {
    await pkg?.close();
  }
}

export const iworkViewer: FileViewerPlugin = {
  manifest: iworkManifest,
  open: openIwork,
};

export { iworkManifest } from "./manifest";
