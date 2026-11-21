import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [runtimeDir, ...djvuFiles] = process.argv.slice(2);
if (!runtimeDir || djvuFiles.length === 0) {
  console.error("Usage: node tools/djvulibre-build/smoke.mjs <runtime-dir> <file.djvu> [...]");
  process.exit(1);
}

const createDjvuModule = (await import(pathToFileURL(resolve(runtimeDir, "djvu.js")).href)).default;
const wasmBinary = await readFile(resolve(runtimeDir, "djvu.wasm"));
const mod = await createDjvuModule({ wasmBinary });

for (const filePath of djvuFiles) {
  const bytes = await readFile(filePath);
  mod.FS.writeFile("/doc.djvu", bytes);
  const pathPtr = mod._malloc(16);
  mod.HEAPU8.set(new TextEncoder().encode("/doc.djvu\0"), pathPtr);
  const handle = mod._djvu_open(pathPtr);
  mod._free(pathPtr);
  try {
    assert.equal(mod._djvu_is_open(handle), 1, `${filePath}: ${mod.UTF8ToString(mod._djvu_last_error(handle))}`);
    const docType = mod._djvu_doc_type(handle);
    const pageCount = mod._djvu_page_count(handle);
    assert.ok(pageCount > 0, `${filePath}: expected pageCount > 0`);

    const infoPtr = mod._malloc(16);
    const okInfo = mod._djvu_page_info(handle, 0, infoPtr);
    assert.equal(okInfo, 1, `${filePath}: expected page 0 info`);
    const [width, height, dpi, rotation] = Array.from(mod.HEAP32.subarray(infoPtr >> 2, (infoPtr >> 2) + 4));
    mod._free(infoPtr);

    const outline = JSON.parse(mod.UTF8ToString(mod._djvu_outline_json(handle)));
    const textRaw = mod.UTF8ToString(mod._djvu_page_text_json(handle, 0));
    const text = textRaw ? JSON.parse(textRaw) : null;

    const targetW = Math.min(width, 256);
    const targetH = Math.max(1, Math.round((height * targetW) / width));
    const rgbaPtr = mod._malloc(targetW * targetH * 4);
    const okRender = mod._djvu_render_page(handle, 0, targetW, targetH, rgbaPtr, 0);
    assert.equal(okRender, 1, `${filePath}: expected render page 0 ok`);
    const rgba = mod.HEAPU8.slice(rgbaPtr, rgbaPtr + targetW * targetH * 4);
    mod._free(rgbaPtr);

    let nonWhite = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] !== 255 || rgba[i + 1] !== 255 || rgba[i + 2] !== 255) nonWhite += 1;
    }
    assert.ok(nonWhite > 0, `${filePath}: expected non-white rendered pixels`);

    console.log(JSON.stringify({
      file: filePath,
      docType,
      pageCount,
      page0: { width, height, dpi, rotation },
      outlineEntries: outline.length,
      textWords: text?.words?.length ?? 0,
      rendered: { targetW, targetH, nonWhite },
    }));
  } finally {
    mod._djvu_close(handle);
    try { mod.FS.unlink("/doc.djvu"); } catch {}
  }
}
