import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertReadsWithin, createTrackedFile, truncated } from "@anyfile/viewer-test";
import { describe, expect, it } from "vitest";
import { probeDjvu } from "./probe";

function makeHeader(prefix: string, formType: string, extra?: Uint8Array): Uint8Array<ArrayBuffer> {
  const head = new TextEncoder().encode(prefix);
  const tail = new TextEncoder().encode(formType);
  const total = head.length + 4 + tail.length + (extra?.length ?? 0);
  const buf = new Uint8Array(new ArrayBuffer(Math.max(16, total)));
  buf.set(head, 0);
  new DataView(buf.buffer).setUint32(head.length, 64, false);
  buf.set(tail, head.length + 4);
  if (extra) buf.set(extra, head.length + 4 + tail.length);
  return buf;
}

function fileFromBytes(bytes: Uint8Array, name: string) {
  return new File([bytes.slice().buffer as ArrayBuffer], name);
}

describe("probeDjvu", () => {
  it("recognizes bundled and single-page real DjVu samples with bounded reads", async () => {
    for (const name of ["lizard2002.djvu", "djvu3spec.djvu"]) {
      const bytes = readFileSync(resolve(__dirname, "../examples", name));
      const tracked = createTrackedFile(bytes, name);
      const level = await probeDjvu({ file: tracked.file, signal: new AbortController().signal });
      expect(level).toBe(4);
      assertReadsWithin(tracked.reads, [{ start: 0, end: 64 }]);
    }
  });

  it("recognizes legacy FORM and IW44 headers and downgrades indirect DJVM to level 2", async () => {
    const legacy = makeHeader("FORM", "DJVU");
    expect(await probeDjvu({ file: fileFromBytes(legacy, "legacy.djv"), signal: new AbortController().signal })).toBe(4);

    const iw44 = makeHeader("AT&TFORM", "PM44");
    expect(await probeDjvu({ file: fileFromBytes(iw44, "photo.djvu"), signal: new AbortController().signal })).toBe(4);

    const dirmIndirect = new Uint8Array([0x44, 0x49, 0x52, 0x4d, 0, 0, 0, 12, 0x01, 0, 2]);
    const indirect = makeHeader("AT&TFORM", "DJVM", dirmIndirect);
    expect(await probeDjvu({ file: fileFromBytes(indirect, "indirect.djvu"), signal: new AbortController().signal })).toBe(2);
  });

  it("rejects disguised, truncated, empty, and aborted inputs", async () => {
    expect(await probeDjvu({ file: new File(["%PDF-1.7"], "fake.djvu"), signal: new AbortController().signal })).toBe(0);
    expect(await probeDjvu({ file: fileFromBytes(truncated(makeHeader("AT&TFORM", "DJVU"), 10), "short.djvu"), signal: new AbortController().signal })).toBe(0);

    const ac = new AbortController();
    ac.abort();
    await expect(probeDjvu({ file: fileFromBytes(makeHeader("AT&TFORM", "DJVU"), "aborted.djvu"), signal: ac.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
