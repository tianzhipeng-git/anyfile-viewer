import { BlobReader, BlobWriter, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js/lib/zip-core-custom.js";
import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { inspectPxd, isPxdPreviewName } from "./inspect";
import { pixelmatorPxdManifest } from "./manifest";
import { createPxdViewerElements, PxdPreviewViewport } from "./ui";

const MAX_ENTRIES = 10_000;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 64 * 1024 * 1024;
const SQLITE_HEADER = "SQLite format 3\0";

function mimeFor(name: string) {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "webp") return "image/webp";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return "image/tiff";
}

function previewFormat(name: string) {
  return name.slice(name.lastIndexOf(".") + 1).toUpperCase().replace("JPG", "JPEG");
}

function fileEntry(entries: readonly Entry[], name: string): FileEntry | undefined {
  const entry = entries.find((candidate) => candidate.filename === name);
  return entry && !entry.directory ? entry as FileEntry : undefined;
}

async function decodePreview(blob: Blob, name: string, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  if (mimeFor(name) !== "image/tiff") return createImageBitmap(blob);
  const { decodeTiff } = await import("@anyfile/general-raster-viewer/tiff");
  const raster = await decodeTiff(new File([blob], name, { type: "image/tiff" }), 0, signal);
  const pixels = new Uint8ClampedArray(raster.rgba.length);
  pixels.set(raster.rgba);
  return createImageBitmap(new ImageData(pixels, raster.width, raster.height), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
}

async function openPixelmatorPxd(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = selectMessages(context.locale, { en: {
    reading: "Inspecting Pixelmator document…", extracting: "Extracting the embedded preview…", ready: "Pixelmator preview opened",
    invalid: "The file is not a valid Pixelmator Pro document with an embedded preview.", limit: "The Pixelmator document preview exceeds browser safety limits.", unsupported: "This browser cannot decode the embedded Pixelmator preview.",
  }, "zh-CN": {
    reading: "正在检查 Pixelmator 文档…", extracting: "正在提取内嵌预览…", ready: "Pixelmator 预览已打开",
    invalid: "文件不是包含内嵌预览的有效 Pixelmator Pro 文档。", limit: "Pixelmator 文档预览超过浏览器安全资源上限。", unsupported: "当前浏览器无法解码内嵌的 Pixelmator 预览。",
  } });
  let root: HTMLDivElement | undefined;
  let viewport: PxdPreviewViewport | undefined;
  let bitmap: ImageBitmap | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    viewport?.dispose();
    if (!viewport) bitmap?.close();
    root?.remove();
  };

  try {
    if (typeof createImageBitmap === "undefined") throw new ViewerError("unsupported-environment", copy.unsupported);
    reportProgress({ stage: "reading", message: copy.reading });
    const inspection = await inspectPxd(file, signal);
    if (!inspection?.hasMetadata || !inspection.previewName) throw new ViewerError("invalid-file", copy.invalid);
    const zipReader = new ZipReader(new BlobReader(file), { useWebWorkers: false, useCompressionStream: false });
    let previewBlob: Blob;
    let previewName: string;
    try {
      const entries = await zipReader.getEntries();
      if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
      if (entries.length > MAX_ENTRIES) throw new ViewerError("resource-limit", copy.limit);
      const metadata = fileEntry(entries, "metadata.info");
      const previewEntry = entries.find((entry) => isPxdPreviewName(entry.filename));
      const preview = previewEntry && !previewEntry.directory ? previewEntry as FileEntry : undefined;
      if (!metadata || !preview || metadata.encrypted || preview.encrypted) throw new ViewerError("invalid-file", copy.invalid);
      if (metadata.uncompressedSize > MAX_METADATA_BYTES || preview.uncompressedSize > MAX_PREVIEW_BYTES) {
        throw new ViewerError("resource-limit", copy.limit);
      }
      const metadataBlob = await metadata.getData(new BlobWriter("application/vnd.sqlite3"), { signal });
      const signature = new TextDecoder().decode(await metadataBlob.slice(0, SQLITE_HEADER.length).arrayBuffer());
      if (signature !== SQLITE_HEADER) throw new ViewerError("invalid-file", copy.invalid);
      reportProgress({ stage: "extracting", message: copy.extracting });
      previewName = preview.filename;
      previewBlob = await preview.getData(new BlobWriter(mimeFor(previewName)), { signal });
    } finally {
      await zipReader.close().catch(() => undefined);
    }
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    try {
      bitmap = await decodePreview(previewBlob, previewName, signal);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      throw new ViewerError("unsupported-environment", copy.unsupported, { cause: error });
    }
    if (!bitmap.width || !bitmap.height) throw new ViewerError("invalid-file", copy.invalid);
    const elements = createPxdViewerElements(file.name, previewFormat(previewName), bitmap.width, bitmap.height, context.locale);
    root = elements.root;
    container.append(root);
    viewport = new PxdPreviewViewport(elements, bitmap);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ViewerError) throw error;
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const pixelmatorPxdViewer: FileViewerPlugin = {
  manifest: pixelmatorPxdManifest,
  open: openPixelmatorPxd,
};

export { pixelmatorPxdManifest } from "./manifest";
