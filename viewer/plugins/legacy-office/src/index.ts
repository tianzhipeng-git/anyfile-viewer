import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { CfbfError, parseCfbf } from "./cfbf";
import { DocParseError, parseDoc } from "./doc";
import { legacyOfficeManifest } from "./manifest";
import { MAX_FILE_BYTES, type LegacyOfficeModel } from "./model";
import { PptParseError, parsePpt } from "./ppt";
import { isCfbfHeader, isRtfHeader } from "./probe";
import { renderLegacyOffice, type RenderedViewer } from "./renderer";
import { parseRtf, RtfParseError } from "./rtf";

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function readBlob(blob: Blob, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) throw abortError();
  const reader = blob.stream().getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const onAbort = () => void reader.cancel();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > MAX_FILE_BYTES) {
        throw new ViewerError("resource-limit", "File exceeds browser safety limit.");
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }

  if (signal.aborted) throw abortError();
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function getCopy(locale: OpenViewerContext["locale"]) {
  return selectMessages(locale, {
    "zh-CN": {
      reading: "正在读取旧版 Office 文档…",
      parsing: "正在解析文档结构…",
      rendering: "正在渲染文档…",
      ready: "文档已打开",
      invalid: "文件内容不是受支持的 DOC、PPT 或 RTF 文档。",
      encrypted: "暂不支持受密码保护或加密的旧版 Office 文档。",
      tooLarge: "文档超过浏览器安全资源上限（128 MiB）。",
    },
    en: {
      reading: "Reading legacy Office document…",
      parsing: "Parsing document structure…",
      rendering: "Rendering document…",
      ready: "Document opened",
      invalid: "The file is not a valid DOC, PPT, or RTF document.",
      encrypted: "Password-protected or encrypted legacy Office files are not supported.",
      tooLarge: "The document exceeds the browser-safe resource limit (128 MiB).",
    },
  });
}

function parseLegacyOfficeBytes(bytes: Uint8Array, fileName: string, copy: ReturnType<typeof getCopy>): LegacyOfficeModel {
  const lower = fileName.toLowerCase();

  if (isRtfHeader(bytes)) {
    if (lower.endsWith(".ppt")) {
      throw new ViewerError("invalid-file", copy.invalid);
    }
    return parseRtf(bytes);
  }

  if (!isCfbfHeader(bytes)) {
    throw new ViewerError("invalid-file", copy.invalid);
  }

  const archive = parseCfbf(bytes);
  if (lower.endsWith(".ppt")) {
    return parsePpt(archive);
  }
  if (lower.endsWith(".doc")) {
    return parseDoc(archive);
  }
  if (archive.hasStream("WordDocument")) {
    return parseDoc(archive);
  }
  if (archive.hasStream("PowerPoint Document")) {
    return parsePpt(archive);
  }
  throw new ViewerError("invalid-file", copy.invalid);
}

async function openLegacyOffice(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, reportPreview, signal, locale } = context;
  const copy = getCopy(locale);
  let rendered: RenderedViewer | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    rendered?.dispose();
  };

  try {
    if (signal.aborted) throw abortError();
    if (file.size > MAX_FILE_BYTES) {
      throw new ViewerError("resource-limit", copy.tooLarge);
    }

    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const bytes = await readBlob(file.slice(0, file.size), signal);
    if (signal.aborted) throw abortError();

    reportProgress({ stage: "parsing", message: copy.parsing, loaded: file.size, total: file.size });
    const model = parseLegacyOfficeBytes(bytes, file.name, copy);
    if (signal.aborted) throw abortError();

    reportProgress({ stage: "rendering", message: copy.rendering, loaded: file.size, total: file.size });
    rendered = renderLegacyOffice(model, file.name, locale);
    if (signal.aborted || disposed) {
      rendered.dispose();
      throw abortError();
    }

    container.append(rendered.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    reportPreview?.({ outcome: "success", kind: "static" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ViewerError) throw error;
    if (error instanceof CfbfError || error instanceof DocParseError || error instanceof PptParseError || error instanceof RtfParseError) {
      if (error.code === "resource-limit") {
        throw new ViewerError("resource-limit", copy.tooLarge, { cause: error });
      }
      const message = /encrypted|password/i.test(error.message) ? copy.encrypted : copy.invalid;
      throw new ViewerError("invalid-file", message, { cause: error });
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const legacyOfficeViewer: FileViewerPlugin = {
  manifest: legacyOfficeManifest,
  open: openLegacyOffice,
};

export { legacyOfficeManifest } from "./manifest";
