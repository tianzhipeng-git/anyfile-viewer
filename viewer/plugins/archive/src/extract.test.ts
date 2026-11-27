// @vitest-environment node
import { resolve } from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import { readFileSync } from "node:fs";

import extractor from "./extract";
import { encryptedEntryZipFixture } from "./test-fixtures";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };
const NOT_ARCHIVE = new TextEncoder().encode("not an archive at all");

function context(name: string, bytes: Uint8Array = new Uint8Array(readFileSync(resolve(EXAMPLES, name)))): ExtractContext {
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([new Uint8Array(bytes)], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

const read = (name: string, target?: string, bytes?: Uint8Array) =>
  extractor.read(context(name, bytes), { target, maxBytes: DEFAULT_READ_MAX_BYTES });

describe("archive ./extract", () => {
  it("passes extractor compliance on ZIP, JMOD, TAR, gzip TAR, RAR and wrapper samples", async () => {
    await assertExtractorCompliance(extractor, [
      { name: "archive.zip", filePath: resolve(EXAMPLES, "archive.zip"), invalidBytes: NOT_ARCHIVE, filter: "txt", smallMaxBytes: 160 },
      { name: "archive.tar", filePath: resolve(EXAMPLES, "archive.tar"), invalidBytes: NOT_ARCHIVE, filter: "payload" },
      { name: "package.tgz", filePath: resolve(EXAMPLES, "package.tgz"), targetId: "entry:payload/资料/说明.txt", smallMaxBytes: 32 },
      { name: "module.jmod", filePath: resolve(EXAMPLES, "module.jmod"), unsupportedFilterTargetId: "entry:README.txt" },
      { name: "archive.rar", filePath: resolve(EXAMPLES, "archive.rar"), invalidBytes: NOT_ARCHIVE },
      { name: "sample.xz", filePath: resolve(EXAMPLES, "sample.xz"), filter: "crc" },
      { name: "empty-zip64.zip", filePath: resolve(EXAMPLES, "empty-zip64.zip") },
    ]);
  }, 30_000);

  it("summarizes entries and lists readable members as targets", async () => {
    const zip = await extractor.inspect(context("archive.zip"));
    expect(zip.metadata).toMatchObject({ format: "ZIP", entryCount: 3, fileCount: 3, unsafePaths: 1, compression: ["Stored", "Deflate"] });
    expect(zip.targets.map(({ id }) => id)).toContain("entry:资料/说明.txt");

    const rar = await extractor.inspect(context("archive.rar"));
    expect(rar.metadata).toMatchObject({ format: "RAR 5.x", entryCount: 2 });
    expect(rar.targets.map(({ id }) => id)).toEqual(["entries", "fields"]);

    const listing = await read("archive.tar");
    expect(listing.content).toContain("| payload/说明-link | symlink | 0 |");
    expect(listing.content).toContain("-> 资料/说明.txt");
  });

  it("reads text members from ZIP (deflate), JMOD and gzip TAR without dumping binary members", async () => {
    expect((await read("archive.zip", "entry:资料/说明.txt")).content).toBe("unicode ZIP payload\n");
    expect((await read("module.jmod", "entry:README.txt")).content).toContain("Anyfile archive metadata viewer example.");
    expect((await read("package.tgz", "entry:payload/资料/说明.txt")).content).toContain("不应读取其 payload");
    expect((await read("archive.tar", "entry:payload/._README.txt")).content).toBe(
      "Binary member `payload/._README.txt` (163 bytes); content is not shown.",
    );
    await expect(read("archive.rar", "entry:资料/说明.txt")).rejects.toMatchObject({ code: "unsupported-capability" });
    await expect(read("archive.zip", "entry:missing.txt")).rejects.toMatchObject({ code: "target-not-found" });
  });

  it("caps large members and maps encrypted members", async () => {
    const big = zipSync({ "big.txt": new TextEncoder().encode("x".repeat(3 * 1024 * 1024)) }, { level: 9 });
    const capped = await extractor.read(context("big.zip", big), { target: "entry:big.txt", maxBytes: 256 * 1024 });
    expect(capped.truncated).toBe(true);
    expect(capped.nextCursor).toBe(`offset:${256 * 1024}`);

    const tail = await extractor.read(context("big.zip", big), {
      target: "entry:big.txt",
      cursor: `offset:${1024 * 1024 - 10}`,
      maxBytes: 256,
    });
    expect(tail.content).toContain(`[member truncated: showing the first ${1024 * 1024} of ${3 * 1024 * 1024} bytes]`);

    await expect(read("locked.zip", "entry:../unsafe.txt", encryptedEntryZipFixture())).rejects.toMatchObject({
      code: "encrypted-file",
    });
  });
});
