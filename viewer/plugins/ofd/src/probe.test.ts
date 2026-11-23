import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertReadsWithin, createTrackedFile } from "@anyfile/viewer-test";
import { zipSync } from "fflate";

import { probeOfd } from "./probe";
import { buildOfd } from "./test-fixtures";

const signal = new AbortController().signal;

describe("OFD probe", () => {
  it("accepts a real invoice reading only the ZIP header and central directory", async () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), "examples", "invoice-sample.ofd")));
    const { file, reads } = createTrackedFile(bytes, "invoice.ofd");
    await expect(probeOfd({ file, signal })).resolves.toBe(4);
    assertReadsWithin(reads, [{ start: 0, end: 4 }, { start: Math.max(0, bytes.length - 8 * 1024), end: bytes.length }]);
    await expect(probeOfd({ file: buildOfd(), signal })).resolves.toBe(4);
  });

  it("rejects other ZIP packages, non-ZIP files and honours abort", async () => {
    const other = zipSync({ "Doc_0/OFD.xml": new Uint8Array(1), "mimetype": new Uint8Array(1) });
    await expect(probeOfd({ file: new File([other.slice().buffer as ArrayBuffer], "disguised.ofd"), signal })).resolves.toBe(0);
    await expect(probeOfd({ file: new File(["%PDF-1.7"], "invalid.ofd"), signal })).resolves.toBe(0);
    const aborted = new AbortController();
    aborted.abort();
    await expect(probeOfd({ file: buildOfd(), signal: aborted.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
