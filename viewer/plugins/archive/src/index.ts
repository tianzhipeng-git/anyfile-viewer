import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { identifyFormat } from "./format-registry";
import { archiveMetadataManifest } from "./manifest";
import { parseRar } from "./parsers/rar";
import { parseTar } from "./parsers/tar";
import { parseWrapper } from "./parsers/wrappers";
import { parseGzipTar } from "./parsers/gzip-tar";
import { RangeReader } from "./range-reader";
import { createArchiveView } from "./ui";
import { parseZip } from "./zip-adapter";

async function identificationBytes(reader: RangeReader, fileName: string): Promise<Uint8Array> {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".tar") || normalized.endsWith(".deflate") ||
      normalized.endsWith(".dfl") || normalized.endsWith(".br")) return new Uint8Array();
  if (reader.size < 2) throw new ViewerError("invalid-file", "压缩文件头已截断。");
  const prefix = await reader.read(0, 2, "header");
  let length = 2;
  if ((prefix[0] === 0x1f && prefix[1] === 0x8b)) length = 3;
  else if ((prefix[0] === 0xfd && prefix[1] === 0x37)) length = 6;
  else if (prefix[0] === 0x52 && prefix[1] === 0x61) length = 8;
  else if ((prefix[0] === 0x42 && prefix[1] === 0x5a) || prefix[0] === 0x50 && prefix[1] === 0x4b ||
    prefix[0] === 0x28 && prefix[1] === 0xb5 || prefix[0] === 0x04 && prefix[1] === 0x22) length = 4;
  else if (prefix[0] === 0x4a && prefix[1] === 0x4d) length = 8;
  if (length === 2) return prefix;
  const suffix = await reader.read(2, length - 2, "header");
  const result = new Uint8Array(length);
  result.set(prefix);
  result.set(suffix, 2);
  return result;
}

async function parse(context: OpenViewerContext, reader: RangeReader) {
  const header = await identificationBytes(reader, context.file.name);
  const format = identifyFormat(context.file.name, header);
  context.reportProgress({ stage: "parsing", message: "正在读取归档元数据…" });
  if (format.id === "zip" || format.id === "jmod") return parseZip(reader, format, context.signal);
  if (format.id === "rar") return parseRar(reader, format);
  if (format.id === "tar") return parseTar(reader, format);
  if (format.id === "gzip" && format.compoundTar) {
    try {
      return await parseGzipTar(context.file, reader, format, context.signal);
    } catch (error) {
      if (context.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (error instanceof ViewerError && error.code === "resource-limit") throw error;
      return parseWrapper(reader, format);
    }
  }
  return parseWrapper(reader, format);
}

async function openArchive(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
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
    if (file.size === 0) throw new ViewerError("invalid-file", "空文件不包含可读取的归档元数据。");
    reportProgress({ stage: "reading", message: "正在识别压缩格式…" });
    const metadata = await parse(context, reader);
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    view = createArchiveView(file.name, metadata, context.locale);
    container.append(view.root);
    signal.addEventListener("abort", abort, { once: true });
    reportProgress({ stage: "ready", message: "归档元数据已打开" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", "文件已损坏，或不是受支持的压缩格式。", { cause: error });
  }
}

export const archiveMetadataViewer: FileViewerPlugin = {
  manifest: archiveMetadataManifest,
  open: openArchive,
};

export { archiveMetadataManifest } from "./manifest";
export { RangeReader } from "./range-reader";
