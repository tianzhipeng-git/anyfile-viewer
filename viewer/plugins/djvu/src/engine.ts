import type { ViewerErrorCode } from "@anyfile/viewer-protocol";
import { DJVU_LIMITS } from "./limits";
import { inspectDjvuHeader } from "./probe";
import type { DjvuDocumentKind, DjvuOpenResult, DjvuOutlineItem, DjvuPageMetrics, DjvuPageText } from "./types";

/** The djvulibre WASM exports; shared by the browser Worker and the Node `./extract`. */
export type DjvuEmscriptenModule = {
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

export class DjvuEngineError extends Error {
  constructor(readonly code: ViewerErrorCode, message: string) {
    super(message);
    this.name = "DjvuEngineError";
  }
}

const DOC_PATH = "/doc.djvu";

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

/** One open document at a time on a djvulibre module instance; failures throw `DjvuEngineError`. */
export function createDjvuEngine(mod: DjvuEmscriptenModule) {
  let docHandle = 0;

  const close = () => {
    if (docHandle) {
      try {
        mod._djvu_close(docHandle);
      } catch {
        // Ignore cleanup errors during replacement/shutdown.
      }
      docHandle = 0;
    }
    try {
      mod.FS.unlink(DOC_PATH);
    } catch {
      // Ignore if file was not written yet.
    }
  };

  function fail(code: ViewerErrorCode, message: string): never {
    close();
    throw new DjvuEngineError(code, message);
  }

  const requireOpen = () => {
    if (!docHandle) throw new DjvuEngineError("invalid-file", "No DjVu document is open.");
    return docHandle;
  };

  return {
    open(bytes: Uint8Array): DjvuOpenResult {
      close();
      if (bytes.byteLength > DJVU_LIMITS.maxInputBytes) {
        throw new DjvuEngineError("resource-limit", "DjVu file exceeds 128 MiB limit.");
      }
      if (!inspectDjvuHeader(bytes.subarray(0, 64)).valid) {
        throw new DjvuEngineError("invalid-file", "Invalid DjVu header.");
      }

      mod.FS.writeFile(DOC_PATH, bytes);
      docHandle = withCString(mod, DOC_PATH, (ptr) => mod._djvu_open(ptr));
      if (!docHandle || mod._djvu_is_open(docHandle) !== 1) {
        fail("invalid-file", docHandle ? mod.UTF8ToString(mod._djvu_last_error(docHandle)) : "Invalid DjVu document.");
      }

      const docType = mapDocType(mod._djvu_doc_type(docHandle));
      if (!docType) fail("invalid-file", "Unknown DjVu document structure.");
      if (docType === "indirect" || docType === "old-indexed") {
        fail("missing-related-file", "Indirect multi-file DjVu requires linked external page files.");
      }

      const pageCount = mod._djvu_page_count(docHandle);
      if (!Number.isInteger(pageCount) || pageCount < 1) fail("invalid-file", "DjVu document has no pages.");
      if (pageCount > DJVU_LIMITS.maxPages) fail("resource-limit", "DjVu page count exceeds limit.");

      const pages: DjvuPageMetrics[] = [];
      const infoPtr = mod._malloc(16);
      if (!infoPtr) throw new RangeError("Out of WASM memory");
      try {
        for (let i = 0; i < pageCount; i += 1) {
          if (mod._djvu_page_info(docHandle, i, infoPtr) !== 1) {
            fail("invalid-file", `Unable to read DjVu page ${i + 1} metadata.`);
          }
          const base = infoPtr >> 2;
          const width = mod.HEAP32[base];
          const height = mod.HEAP32[base + 1];
          const dpi = mod.HEAP32[base + 2] || 300;
          const rotation = mod.HEAP32[base + 3] || 0;
          if (width <= 0 || height <= 0 || width * height > DJVU_LIMITS.maxPageSourcePixels) {
            fail("resource-limit", `DjVu page ${i + 1} dimensions exceed limits.`);
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

      return { docType, pageCount, pages, outline };
    },

    render(pageIndex: number, width: number, height: number, thumbnail = false) {
      const handle = requireOpen();
      const pixelLimit = thumbnail ? DJVU_LIMITS.maxThumbnailPixels : DJVU_LIMITS.maxRenderPixels;
      const pixels = width * height;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels > pixelLimit) {
        throw new DjvuEngineError("resource-limit", "Requested DjVu render size exceeds limits.");
      }
      const byteLength = pixels * 4;
      const rgbaPtr = mod._malloc(byteLength);
      if (!rgbaPtr) throw new DjvuEngineError("resource-limit", "Out of WASM memory while rendering DjVu page.");
      try {
        if (mod._djvu_render_page(handle, pageIndex, width, height, rgbaPtr, 0) !== 1) {
          throw new DjvuEngineError("invalid-file", mod.UTF8ToString(mod._djvu_last_error(handle)) || "Failed to decode DjVu page.");
        }
        return { width, height, rgba: mod.HEAPU8.slice(rgbaPtr, rgbaPtr + byteLength).buffer as ArrayBuffer };
      } finally {
        mod._free(rgbaPtr);
      }
    },

    text(pageIndex: number): DjvuPageText | null {
      return validatePageText(mod.UTF8ToString(mod._djvu_page_text_json(requireOpen(), pageIndex)));
    },

    close,
  };
}

export type DjvuEngine = ReturnType<typeof createDjvuEngine>;
