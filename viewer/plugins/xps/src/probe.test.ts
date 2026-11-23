import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertReadsWithin, createTrackedFile } from "@anyfile/viewer-test";
import { zipSync } from "fflate";

import { probeXps } from "./probe";
import { buildXps } from "./test-fixtures";

const signal = new AbortController().signal;

describe("XPS probe", () => {
  it("accepts real XPS packages reading only the ZIP header and central directory", async () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), "examples", "testPPT.xps")));
    const { file, reads } = createTrackedFile(bytes, "testPPT.xps");
    await expect(probeXps({ file, signal })).resolves.toBe(4);
    assertReadsWithin(reads, [{ start: 0, end: 4 }, { start: bytes.length - 8 * 1024, end: bytes.length }]);
  });

  it("accepts OpenXPS with interleaved page pieces", async () => {
    await expect(probeXps({ file: buildXps({ openXps: true, pieces: true }), signal })).resolves.toBe(4);
  });

  it("rejects other OPC packages, non-ZIP files and honours abort", async () => {
    const docx = zipSync({ "[Content_Types].xml": new Uint8Array(1), "word/document.xml": new Uint8Array(1) });
    await expect(probeXps({ file: new File([docx.slice().buffer as ArrayBuffer], "disguised.xps"), signal })).resolves.toBe(0);
    await expect(probeXps({ file: new File(["%PDF-1.7"], "invalid.xps"), signal })).resolves.toBe(0);
    const aborted = new AbortController();
    aborted.abort();
    await expect(probeXps({ file: buildXps(), signal: aborted.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
