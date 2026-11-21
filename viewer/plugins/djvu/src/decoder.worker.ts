/// <reference lib="webworker" />

import { DJVU_LIMITS } from "./limits";
import { inspectDjvuHeader } from "./probe";
import type {
  DjvuDocumentKind,
  DjvuOutlineItem,
  DjvuPageMetrics,
  DjvuPageText,
  DjvuWorkerRequest,
  DjvuWorkerResponse,
} from "./types";

type DjvuEmscriptenModule = {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
  };
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  UTF8ToString(ptr: number): string;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _djvu_open(pathPtr: number): number;
  _djvu_is_open(handle: number): number;
  _djvu_last_error(handle: number): number;
  _djvu_doc_type(handle: number): number;
  _djvu_page_count(handle: number): number;
  _djvu_page_info(handle: number, pageno: number, out4IntsPtr: number): number;
  _djvu_outline_json(handle: number): number;
  _djvu_page_text_json(handle: number, pageno: number): number;
  _djvu_render_page(handle: number, pageno: number, w: number, h: number, outRgbaPtr: number, mode: number): number;
  _djvu_close(handle: number): void;
};

type DjvuModuleFactory = (options?: {
  locateFile?: (path: string) => string;
}) => Promise<DjvuEmscriptenModule>;

const DOC_PATH = "/doc.djvu";
const workerScope = self as DedicatedWorkerGlobalScope;

let mod: DjvuEmscriptenModule | undefined;
let docHandle = 0;

function post(response: DjvuWorkerResponse, transfer: Transferable[] = []) {
  workerScope.postMessage(response, transfer);
}

function closeDocument() {
  if (mod && docHandle) {
    try {
      mod._djvu_close(docHandle);
    } catch {
      // Ignore cleanup errors during replacement/shutdown.
    }
    docHandle = 0;
  }
  if (mod) {
    try {
      mod.FS.unlink(DOC_PATH);
    } catch {
      // Ignore if file was not written yet.
    }
  }
}

function mapDocType(code: number): DjvuDocumentKind | undefined {
  switch (code) {
    case 1:
      return "single";
    case 2:
      return "bundled";
    case 3:
      return "indirect";
    case 4:
      return "old-bundled";
    case 5:
      return "old-indexed";
    default:
      return undefined;
  }
}

function validatePageText(raw: string): DjvuPageText | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as { scale?: unknown; words?: unknown };
  const scale = typeof candidate.scale === "number" && candidate.scale > 0 ? candidate.scale : 0;
  if (!scale || !Array.isArray(candidate.words) || candidate.words.length === 0) return null;

  const words = [];
  for (const item of candidate.words) {
    if (words.length >= DJVU_LIMITS.maxTextWordsPerPage) break;
    if (!item || typeof item !== "object") continue;
    const wItem = item as Record<string, unknown>;
    const x = Number(wItem.x);
    const y = Number(wItem.y);
    const w = Number(wItem.w);
    const h = Number(wItem.h);
    const t = typeof wItem.t === "string" ? wItem.t : "";
    if (!t || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
      return null;
    }
    if (w <= 0 || h <= 0 || x < -scale * 0.05 || y < -scale * 0.05 || x + w > scale * 1.05 || y + h > scale * 1.05) {
      return null;
    }
    words.push({ x, y, w, h, t });
  }

  return words.length > 0 ? { scale, words } : null;
}

function withCString<T>(runtime: DjvuEmscriptenModule, text: string, fn: (ptr: number) => T): T {
  const encoded = new TextEncoder().encode(`${text}\0`);
  const ptr = runtime._malloc(encoded.byteLength);
  if (!ptr) throw new RangeError("Out of WASM memory");
  try {
    runtime.HEAPU8.set(encoded, ptr);
    return fn(ptr);
  } finally {
    runtime._free(ptr);
  }
}

workerScope.onmessage = async (event: MessageEvent<DjvuWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "init") {
      const loaded = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ request.runtimeUrl) as {
        default: DjvuModuleFactory;
      };
      mod = await loaded.default({
        locateFile(path: string) {
          return path.endsWith(".wasm") ? request.wasmUrl : path;
        },
      });
      post({ type: "ready", id: request.id });
      return;
    }

    if (!mod) {
      post({ type: "error", id: request.id, code: "unsupported-environment", message: "DjVu runtime is not initialized." });
      return;
    }

    if (request.type === "open") {
      closeDocument();
      if (request.buffer.byteLength > DJVU_LIMITS.maxInputBytes) {
        post({ type: "error", id: request.id, code: "resource-limit", message: "DjVu file exceeds 128 MiB limit." });
        return;
      }
      const header = inspectDjvuHeader(new Uint8Array(request.buffer, 0, Math.min(request.buffer.byteLength, 64)));
      if (!header.valid) {
        post({ type: "error", id: request.id, code: "invalid-file", message: "Invalid DjVu header." });
        return;
      }

      mod.FS.writeFile(DOC_PATH, new Uint8Array(request.buffer));
      docHandle = withCString(mod, DOC_PATH, (ptr) => mod!._djvu_open(ptr));
      if (!docHandle || mod._djvu_is_open(docHandle) !== 1) {
        const msg = docHandle ? mod.UTF8ToString(mod._djvu_last_error(docHandle)) : "Invalid DjVu document.";
        closeDocument();
        post({ type: "error", id: request.id, code: "invalid-file", message: msg });
        return;
      }

      const docType = mapDocType(mod._djvu_doc_type(docHandle));
      if (!docType) {
        closeDocument();
        post({ type: "error", id: request.id, code: "invalid-file", message: "Unknown DjVu document structure." });
        return;
      }
      if (docType === "indirect" || docType === "old-indexed") {
        closeDocument();
        post({
          type: "error",
          id: request.id,
          code: "missing-related-file",
          message: "Indirect multi-file DjVu requires linked external page files.",
        });
        return;
      }

      const pageCount = mod._djvu_page_count(docHandle);
      if (!Number.isInteger(pageCount) || pageCount < 1) {
        closeDocument();
        post({ type: "error", id: request.id, code: "invalid-file", message: "DjVu document has no pages." });
        return;
      }
      if (pageCount > DJVU_LIMITS.maxPages) {
        closeDocument();
        post({ type: "error", id: request.id, code: "resource-limit", message: "DjVu page count exceeds limit." });
        return;
      }

      const pages: DjvuPageMetrics[] = [];
      const infoPtr = mod._malloc(16);
      if (!infoPtr) throw new RangeError("Out of WASM memory");
      try {
        for (let i = 0; i < pageCount; i += 1) {
          const ok = mod._djvu_page_info(docHandle, i, infoPtr);
          if (ok !== 1) {
            closeDocument();
            post({ type: "error", id: request.id, code: "invalid-file", message: `Unable to read DjVu page ${i + 1} metadata.` });
            return;
          }
          const base = infoPtr >> 2;
          const width = mod.HEAP32[base];
          const height = mod.HEAP32[base + 1];
          const dpi = mod.HEAP32[base + 2] || 300;
          const rotation = mod.HEAP32[base + 3] || 0;
          if (width <= 0 || height <= 0 || width * height > DJVU_LIMITS.maxPageSourcePixels) {
            closeDocument();
            post({ type: "error", id: request.id, code: "resource-limit", message: `DjVu page ${i + 1} dimensions exceed limits.` });
            return;
          }
          pages.push({ width, height, dpi, rotation });
        }
      } finally {
        mod._free(infoPtr);
      }

      let outline: DjvuOutlineItem[] = [];
      try {
        const outlineRaw = mod.UTF8ToString(mod._djvu_outline_json(docHandle));
        const parsed = outlineRaw ? JSON.parse(outlineRaw) : [];
        if (Array.isArray(parsed)) outline = parsed as DjvuOutlineItem[];
      } catch {
        outline = [];
      }

      post({
        type: "opened",
        id: request.id,
        document: { docType, pageCount, pages, outline },
      });
      return;
    }

    if (!docHandle) {
      post({ type: "error", id: request.id, code: "invalid-file", message: "No DjVu document is open." });
      return;
    }

    if (request.type === "render") {
      const pixelLimit = request.thumbnail ? DJVU_LIMITS.maxThumbnailPixels : DJVU_LIMITS.maxRenderPixels;
      const pixels = request.width * request.height;
      if (
        !Number.isInteger(request.width) ||
        !Number.isInteger(request.height) ||
        request.width < 1 ||
        request.height < 1 ||
        pixels > pixelLimit
      ) {
        post({ type: "error", id: request.id, code: "resource-limit", message: "Requested DjVu render size exceeds limits." });
        return;
      }
      const byteLength = pixels * 4;
      const rgbaPtr = mod._malloc(byteLength);
      if (!rgbaPtr) {
        post({ type: "error", id: request.id, code: "resource-limit", message: "Out of WASM memory while rendering DjVu page." });
        return;
      }
      try {
        const ok = mod._djvu_render_page(docHandle, request.pageIndex, request.width, request.height, rgbaPtr, 0);
        if (ok !== 1) {
          const msg = mod.UTF8ToString(mod._djvu_last_error(docHandle)) || "Failed to decode DjVu page.";
          post({ type: "error", id: request.id, code: "invalid-file", message: msg });
          return;
        }
        const copy = mod.HEAPU8.slice(rgbaPtr, rgbaPtr + byteLength);
        const rgbaBuffer = copy.buffer;
        post({ type: "rendered", id: request.id, width: request.width, height: request.height, rgba: rgbaBuffer }, [rgbaBuffer]);
      } finally {
        mod._free(rgbaPtr);
      }
      return;
    }

    if (request.type === "text") {
      const raw = mod.UTF8ToString(mod._djvu_page_text_json(docHandle, request.pageIndex));
      post({ type: "text", id: request.id, pageText: validatePageText(raw) });
    }
  } catch (error) {
    const code = request.type === "init"
      ? "unsupported-environment"
      : error instanceof RangeError
        ? "resource-limit"
        : "invalid-file";
    post({
      type: "error",
      id: request.id,
      code,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
