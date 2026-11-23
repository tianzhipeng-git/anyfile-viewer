import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertReadsWithin, createTrackedFile } from "@anyfile/viewer-test";
import { zipSync } from "fflate";

import { probeIwork } from "./probe";

const signal = new AbortController().signal;

function zipFile(entries: Record<string, Uint8Array>, name: string) {
  return new File([zipSync(entries, { level: 0 }).slice().buffer as ArrayBuffer], name);
}

describe("iWork probe", () => {
  it("ranks IWA packages above iWork '09 XML and reads only the ZIP directory", async () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), "examples", "testKeynote2013.key")));
    const { file, reads } = createTrackedFile(bytes, "talk.key");
    await expect(probeIwork({ file, signal })).resolves.toBe(3);
    // Local header signature, then the central directory and EOCD tail; never entry payloads.
    const directoryStart = bytes.length - 8 * 1024;
    assertReadsWithin(reads, [{ start: 0, end: 4 }, { start: directoryStart, end: bytes.length }]);

    const legacy = new File([readFileSync(join(process.cwd(), "examples", "testPages.pages"))], "letter.pages");
    await expect(probeIwork({ file: legacy, signal })).resolves.toBe(2);
  });

  it("routes zipped bundles and password-protected documents", async () => {
    const bundle = zipFile({ "Deck.key/Index.zip": new Uint8Array(4) }, "deck.key");
    await expect(probeIwork({ file: bundle, signal })).resolves.toBe(3);
    const locked = zipFile({ "Index/Document.iwa": new Uint8Array(4), ".iwpv2": new Uint8Array(4) }, "locked.pages");
    await expect(probeIwork({ file: locked, signal })).resolves.toBe(1);
  });

  it("rejects private keys, ordinary ZIPs and deeply nested look-alikes", async () => {
    const pem = new File(["-----BEGIN PRIVATE KEY-----\n"], "server.key");
    await expect(probeIwork({ file: pem, signal })).resolves.toBe(0);
    const zip = zipFile({ "readme.txt": new Uint8Array(1) }, "notes.pages");
    await expect(probeIwork({ file: zip, signal })).resolves.toBe(0);
    const nested = zipFile({ "a/b/Index/Document.iwa": new Uint8Array(4) }, "nested.pages");
    await expect(probeIwork({ file: nested, signal })).resolves.toBe(0);
  });
});
