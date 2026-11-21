// @vitest-environment node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const runtimeDir = resolve(__dirname, "../../../../third_party/djvulibre/3.5.29-anyfile.1");
const examplesDir = resolve(__dirname, "../examples");

async function loadDjvuWasm() {
  const factory = (await import(pathToFileURL(join(runtimeDir, "djvu.js")).href)).default as (opts: {
    wasmBinary: Uint8Array;
  }) => Promise<{
    FS: { writeFile(path: string, data: Uint8Array): void; unlink(path: string): void };
    HEAPU8: Uint8Array;
    HEAP32: Int32Array;
    UTF8ToString(ptr: number): string;
    _malloc(size: number): number;
    _free(ptr: number): void;
    _djvu_open(pathPtr: number): number;
    _djvu_is_open(handle: number): number;
    _djvu_doc_type(handle: number): number;
    _djvu_page_count(handle: number): number;
    _djvu_page_info(handle: number, pageno: number, out4: number): number;
    _djvu_outline_json(handle: number): number;
    _djvu_page_text_json(handle: number, pageno: number): number;
    _djvu_render_page(handle: number, pageno: number, w: number, h: number, outRgba: number, mode: number): number;
    _djvu_close(handle: number): void;
  }>;
  const wasmBinary = await readFile(join(runtimeDir, "djvu.wasm"));
  return factory({ wasmBinary });
}

function openFromBytes(mod: Awaited<ReturnType<typeof loadDjvuWasm>>, bytes: Uint8Array) {
  mod.FS.writeFile("/test.djvu", bytes);
  const pathBytes = new TextEncoder().encode("/test.djvu\0");
  const ptr = mod._malloc(pathBytes.length);
  mod.HEAPU8.set(pathBytes, ptr);
  const handle = mod._djvu_open(ptr);
  mod._free(ptr);
  return handle;
}

describe("djvulibre WASM decoder", () => {
  it("decodes single-page lizard2002.djvu and multipage djvu3spec.djvu", async () => {
    const mod = await loadDjvuWasm();

    // 1. Bundled lizard2002.djvu (2 pages + shared dictionary)
    const singleBytes = await readFile(join(examplesDir, "lizard2002.djvu"));
    const h1 = openFromBytes(mod, singleBytes);
    try {
      expect(mod._djvu_is_open(h1)).toBe(1);
      expect(mod._djvu_doc_type(h1)).toBe(2);
      expect(mod._djvu_page_count(h1)).toBe(2);

      const infoPtr = mod._malloc(16);
      expect(mod._djvu_page_info(h1, 0, infoPtr)).toBe(1);
      const [w, h, dpi] = Array.from(mod.HEAP32.subarray(infoPtr >> 2, (infoPtr >> 2) + 4));
      mod._free(infoPtr);
      expect(w).toBeGreaterThan(100);
      expect(h).toBeGreaterThan(100);
      expect(dpi).toBeGreaterThan(0);

      const tw = 160;
      const th = Math.max(1, Math.round((h * tw) / w));
      const rgbaPtr = mod._malloc(tw * th * 4);
      expect(mod._djvu_render_page(h1, 0, tw, th, rgbaPtr, 0)).toBe(1);
      const pixels = mod.HEAPU8.slice(rgbaPtr, rgbaPtr + tw * th * 4);
      mod._free(rgbaPtr);
      let nonWhite = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255) nonWhite += 1;
      }
      expect(nonWhite).toBeGreaterThan(10);
    } finally {
      mod._djvu_close(h1);
      try { mod.FS.unlink("/test.djvu"); } catch {}
    }

    // 2. Multi-page bundled DjVu with outline and text layer
    const multiBytes = await readFile(join(examplesDir, "djvu3spec.djvu"));
    const h2 = openFromBytes(mod, multiBytes);
    try {
      expect(mod._djvu_is_open(h2)).toBe(1);
      expect(mod._djvu_doc_type(h2)).toBe(2);
      const count = mod._djvu_page_count(h2);
      expect(count).toBeGreaterThan(10);

      const outline = JSON.parse(mod.UTF8ToString(mod._djvu_outline_json(h2))) as Array<{ title: string; page: number }>;
      expect(Array.isArray(outline)).toBe(true);
      expect(outline.length).toBe(13);
      expect(outline[0].page).toBeGreaterThanOrEqual(0);

      const textRaw = mod.UTF8ToString(mod._djvu_page_text_json(h2, 0));
      expect(textRaw.length).toBeGreaterThan(0);
      const parsed = JSON.parse(textRaw) as { scale: number; words: Array<{ t: string; x: number; y: number; w: number; h: number }> };
      expect(parsed.words.length).toBeGreaterThan(100);
      expect(parsed.words.some((w) => /djvu/i.test(w.t))).toBe(true);

      const rgbaPtr = mod._malloc(120 * 160 * 4);
      expect(mod._djvu_render_page(h2, 1, 120, 160, rgbaPtr, 0)).toBe(1);
      mod._free(rgbaPtr);
    } finally {
      mod._djvu_close(h2);
      try { mod.FS.unlink("/test.djvu"); } catch {}
    }
  });

  it("rejects corrupt or truncated DjVu payloads cleanly", async () => {
    const mod = await loadDjvuWasm();
    const bad = new TextEncoder().encode("AT&TFORM\0\0\0\x10DJVUCORRUPT");
    const h = openFromBytes(mod, bad);
    try {
      expect(mod._djvu_is_open(h)).toBe(0);
    } finally {
      mod._djvu_close(h);
      try { mod.FS.unlink("/test.djvu"); } catch {}
    }
  });

  const externalSample = process.env.DJVU_TEST_FILE;
  it.skipIf(!externalSample)("opens optional external real DjVu file", async () => {
    const mod = await loadDjvuWasm();
    const bytes = await readFile(externalSample!);
    const h = openFromBytes(mod, bytes);
    try {
      expect(mod._djvu_is_open(h)).toBe(1);
      expect(mod._djvu_page_count(h)).toBeGreaterThan(0);
      const rgbaPtr = mod._malloc(128 * 128 * 4);
      expect(mod._djvu_render_page(h, 0, 128, 128, rgbaPtr, 0)).toBe(1);
      mod._free(rgbaPtr);
    } finally {
      mod._djvu_close(h);
      try { mod.FS.unlink("/test.djvu"); } catch {}
    }
  });
});
