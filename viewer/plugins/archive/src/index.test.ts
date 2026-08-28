import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest, ViewerError } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { crc32 } from "./binary";
import { archiveMetadataViewer, RangeReader } from "./index";
import { archiveMetadataManifest } from "./manifest";
import { encryptedHeadersRar5Fixture, rar4Fixture, rar5Fixture } from "./rar-test-fixtures";
import {
  cp437ZipFixture,
  duplicateZipFixture,
  encryptedEntryZipFixture,
  gnuTarFixture,
  invalidSizeTarFixture,
  negativeMtimeTarFixture,
  tarFixture,
  unflaggedUtf8ZipFixture,
  wrapperFixtures,
  zip64Fixture,
  zipFixture,
  zipPayloadRanges,
} from "./test-fixtures";

const contexts: ViewerTestContext[] = [];

function contextFor(bytes: Uint8Array, name: string, locale = "zh-CN") {
  const context = createViewerTestContext(new File([bytes.slice().buffer as ArrayBuffer], name));
  contexts.push(context);
  return { ...context, context: { ...context.context, locale } };
}

function exampleContext(name: string) {
  const bytes = Uint8Array.from(readFileSync(join(process.cwd(), "examples", name)));
  return contextFor(bytes, name);
}

function trackedFile(bytes: Uint8Array, name: string) {
  const file = new File([bytes.slice().buffer as ArrayBuffer], name);
  const originalSlice = file.slice.bind(file);
  const ranges: { start: number; end: number }[] = [];
  vi.spyOn(file, "slice").mockImplementation((start = 0, end = file.size, contentType) => {
    const normalizedStart = Number(start);
    const normalizedEnd = Number(end);
    ranges.push({ start: normalizedStart, end: normalizedEnd });
    return originalSlice(start, end, contentType);
  });
  return { file, ranges };
}

function overlaps(left: { start: number; end: number }, right: { start: number; end: number }) {
  return left.start < right.end && right.start < left.end;
}

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
});

describe("archive metadata viewer", () => {
  it("publishes the phase-one archive and wrapper manifest", () => {
    expect(() => validateManifest(archiveMetadataManifest)).not.toThrow();
    const extensions = archiveMetadataManifest.formats.flatMap((format) => format.extensions);
    expect(extensions).toEqual(expect.arrayContaining([
      ".zip", ".jar", ".docx", ".rar", ".tar", ".tar.gz", ".xz", ".zst", ".bz2", ".lz4", ".zlib", ".deflate", ".br",
    ]));
  });

  it("reads RAR5 headers without touching compressed payloads", async () => {
    const fixture = rar5Fixture();
    const tracked = trackedFile(fixture.bytes, "archive.rar");
    const test = createViewerTestContext(tracked.file);
    contexts.push(test);
    const directRead = vi.spyOn(tracked.file, "arrayBuffer");
    const controller = await archiveMetadataViewer.open(test.context);

    expect(test.container.textContent).toContain("RAR 5.x");
    expect(test.container.textContent).toContain("资料/说明.txt");
    expect(test.container.textContent).toContain("已加密");
    expect(test.container.textContent).toContain("../unsafe.txt");
    expect(test.container.textContent).toContain("危险路径");
    expect(directRead).not.toHaveBeenCalled();
    expect(tracked.ranges.every((range) => !overlaps(range, fixture.payload))).toBe(true);
    await controller.dispose();
  });

  it("reads RAR4 headers without touching compressed payloads", async () => {
    const fixture = rar4Fixture();
    const tracked = trackedFile(fixture.bytes, "legacy.rar");
    const test = createViewerTestContext(tracked.file);
    contexts.push(test);
    const controller = await archiveMetadataViewer.open(test.context);

    expect(test.container.textContent).toContain("RAR 4.x");
    expect(test.container.textContent).toContain("folder/legacy.txt");
    expect(test.container.textContent).toContain("321");
    expect(tracked.ranges.every((range) => !overlaps(range, fixture.payload))).toBe(true);
    await controller.dispose();
  });

  it("finds SFX RAR signatures and reports encrypted headers and volumes", async () => {
    const sfx = contextFor(rar5Fixture({ sfx: true, volume: true }).bytes, "installer.rar");
    const sfxController = await archiveMetadataViewer.open(sfx.context);
    expect(sfx.container.textContent).toContain("SFX 内 RAR5 签名");
    expect(sfx.container.textContent).toContain("卷 2");
    expect(sfx.container.textContent).toContain("不自动查找或拼接其他卷");
    await sfxController.dispose();

    const encrypted = contextFor(encryptedHeadersRar5Fixture(), "private.rar");
    const encryptedController = await archiveMetadataViewer.open(encrypted.context);
    expect(encrypted.container.textContent).toContain("文件头已加密");
    expect(encrypted.container.querySelector("table")).toBeNull();
    await encryptedController.dispose();
  });

  it("rejects damaged and truncated RAR headers", async () => {
    const damaged = rar5Fixture().bytes.slice();
    damaged[9] ^= 0xff;
    await expect(archiveMetadataViewer.open(contextFor(damaged, "damaged.rar").context))
      .rejects.toMatchObject({ code: "invalid-file" });
    await expect(archiveMetadataViewer.open(contextFor(rar4Fixture().bytes.subarray(0, 19), "truncated.rar").context))
      .rejects.toMatchObject({ code: "invalid-file" });
  });

  it("reads ZIP central-directory metadata without touching entry payloads", async () => {
    const bytes = zipFixture();
    const tracked = trackedFile(bytes, "archive.zip");
    const test = createViewerTestContext(tracked.file);
    contexts.push(test);
    const directRead = vi.spyOn(tracked.file, "arrayBuffer");
    const controller = await archiveMetadataViewer.open(test.context);

    expect(test.container.textContent).toContain("archive comment");
    expect(test.container.textContent).toContain("../unsafe.txt");
    expect(test.container.textContent).toContain("危险路径");
    expect(test.container.textContent).toContain("资料/说明.txt");
    expect(directRead).not.toHaveBeenCalled();
    for (const read of tracked.ranges) {
      for (const payload of zipPayloadRanges(bytes)) expect(overlaps(read, payload)).toBe(false);
    }
    expect(test.progress.at(-1)?.stage).toBe("ready");
    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
  });

  it("renders at most one ZIP page and filters by path", async () => {
    const test = contextFor(zipFixture(205), "many.zip");
    const controller = await archiveMetadataViewer.open(test.context);
    expect(test.container.querySelectorAll("tbody tr")).toHaveLength(100);
    expect(test.container.querySelector("[data-meta]")?.textContent).toBe("1–100 / 205");

    const filter = test.container.querySelector<HTMLInputElement>("[data-archive-filter]")!;
    filter.value = "file-204";
    filter.dispatchEvent(new Event("input"));
    expect(test.container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(test.container.textContent).toContain("folder/file-204.txt");
    await controller.dispose();
  });

  it("opens an empty ZIP64 archive", async () => {
    const test = contextFor(zip64Fixture(), "empty.zip");
    const controller = await archiveMetadataViewer.open(test.context);
    expect(test.container.textContent).toContain("ZIP64");
    expect(test.container.querySelector("[data-meta]")?.textContent).toBe("0");
    await controller.dispose();
  });

  it("preserves duplicate and CP437 ZIP paths and reports encrypted entries", async () => {
    const duplicate = contextFor(duplicateZipFixture(), "duplicate.zip");
    const duplicateController = await archiveMetadataViewer.open(duplicate.context);
    expect(duplicate.container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(duplicate.container.querySelector("[data-meta]")?.textContent).toBe("1–2 / 2");
    expect(duplicate.container.textContent).toContain("duplicate filename");
    await duplicateController.dispose();

    const cp437 = contextFor(cp437ZipFixture(), "legacy.zip");
    const cp437Controller = await archiveMetadataViewer.open(cp437.context);
    expect(cp437.container.textContent).toContain("é.txt");
    await cp437Controller.dispose();

    const encrypted = contextFor(encryptedEntryZipFixture(), "encrypted-entry.zip");
    const encryptedController = await archiveMetadataViewer.open(encrypted.context);
    expect(encrypted.container.textContent).toContain("已加密");
    await encryptedController.dispose();
  });

  it("decodes UTF-8 ZIP paths when the language encoding flag is missing", async () => {
    const test = contextFor(unflaggedUtf8ZipFixture(), "macos.zip");
    const controller = await archiveMetadataViewer.open(test.context);

    expect(test.container.textContent).toContain("小照片/说明.txt");
    await controller.dispose();
  });

  it("reads TAR headers and PAX metadata while skipping ordinary payload", async () => {
    const fixture = tarFixture();
    const tracked = trackedFile(fixture.bytes, "archive.tar");
    const test = createViewerTestContext(tracked.file);
    contexts.push(test);
    const controller = await archiveMetadataViewer.open(test.context);

    expect(test.container.textContent).toContain("folder/来自-pax.txt");
    expect(test.container.textContent).toContain("符号链接");
    expect(tracked.ranges.some((range) => overlaps(range, fixture.payload))).toBe(false);
    await controller.dispose();
  });

  it("supports GNU longname metadata and sparse entry markers", async () => {
    const test = contextFor(gnuTarFixture(), "gnu.tar");
    const controller = await archiveMetadataViewer.open(test.context);
    expect(test.container.textContent).toContain("long-directory/long-directory/");
    expect(test.container.textContent).toContain("GNU 稀疏文件");
    expect(test.container.textContent).toContain("GNU TAR");
    await controller.dispose();
  });

  it("accepts empty TAR archives and negative GNU base-256 mtimes", async () => {
    const empty = contextFor(new Uint8Array(1024), "empty.tar");
    const emptyController = await archiveMetadataViewer.open(empty.context);
    expect(empty.container.querySelector("[data-meta]")?.textContent).toBe("0");
    await emptyController.dispose();

    const negativeMtime = contextFor(negativeMtimeTarFixture(), "pre-epoch.tar");
    const negativeController = await archiveMetadataViewer.open(negativeMtime.context);
    expect(negativeMtime.container.textContent).toContain("pre-epoch.txt");
    await negativeController.dispose();
  });

  it("rejects invalid TAR sizes and truncated TAR headers", async () => {
    const invalidSize = contextFor(invalidSizeTarFixture(), "invalid-size.tar");
    await expect(archiveMetadataViewer.open(invalidSize.context)).rejects.toMatchObject({
      code: "invalid-file",
      message: expect.stringContaining("条目大小"),
    });
    const truncated = contextFor(tarFixture().bytes.subarray(0, 600), "truncated.tar");
    await expect(archiveMetadataViewer.open(truncated.context)).rejects.toMatchObject({ code: "invalid-file" });
  });

  it.each([
    ["sample.gz", "gzip"], ["sample.xz", "XZ"], ["sample.zst", "Zstandard"],
    ["sample.bz2", "bzip2"], ["sample.lz4", "LZ4"], ["sample.zlib", "zlib"],
    ["sample.deflate", "raw DEFLATE"], ["sample.br", "Brotli"],
  ])("shows directly available wrapper metadata for %s", async (name, expected) => {
    const test = contextFor(wrapperFixtures[name], name);
    const controller = await archiveMetadataViewer.open(test.context);
    expect(test.container.textContent).toContain(expected);
    expect(test.container.querySelector("table")).toBeNull();
    await controller.dispose();
  });

  it("reads optional gzip text fields and zlib dictionary identifiers", async () => {
    const gzip = contextFor(wrapperFixtures["options.gz"], "options.gz");
    const gzipController = await archiveMetadataViewer.open(gzip.context);
    expect(gzip.container.textContent).toContain("original.tar");
    expect(gzip.container.textContent).toContain("comment");
    await gzipController.dispose();

    const zlib = contextFor(wrapperFixtures["dictionary.zlib"], "dictionary.zlib");
    const zlibController = await archiveMetadataViewer.open(zlib.context);
    expect(zlib.container.textContent).toContain("0x11223344");
    await zlibController.dispose();
  });

  it("handles large Zstandard window exponents without 32-bit wrapping", async () => {
    const largeWindow = Uint8Array.of(0x28, 0xb5, 0x2f, 0xfd, 0, 0xf8, 0);
    const test = contextFor(largeWindow, "large-window.zst");
    const controller = await archiveMetadataViewer.open(test.context);
    expect(test.container.textContent?.replaceAll(",", "")).toContain("2199023255552 字节");
    await controller.dispose();
  });

  it("rejects truncated wrapper headers and displays unknown XZ check IDs", async () => {
    for (const [name, bytes] of [
      ["truncated.gz", wrapperFixtures["sample.gz"].subarray(0, 10)],
      ["truncated.xz", wrapperFixtures["sample.xz"].subarray(0, 12)],
    ] as const) {
      const test = contextFor(bytes, name);
      await expect(archiveMetadataViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    }

    const unknownCheck = wrapperFixtures["sample.xz"].slice();
    const data = new DataView(unknownCheck.buffer, unknownCheck.byteOffset, unknownCheck.byteLength);
    unknownCheck[7] = 2;
    data.setUint32(8, crc32(unknownCheck.subarray(6, 8)), true);
    const footerOffset = unknownCheck.length - 12;
    unknownCheck[footerOffset + 9] = 2;
    data.setUint32(footerOffset, crc32(unknownCheck.subarray(footerOffset + 4, footerOffset + 10)), true);
    const unknown = contextFor(unknownCheck, "unknown-check.xz");
    const controller = await archiveMetadataViewer.open(unknown.context);
    expect(unknown.container.textContent).toContain("未知 (2)");
    await controller.dispose();
  });

  it("uses the outer wrapper for compound TAR compression", async () => {
    const bytes = wrapperFixtures["sample.gz"];
    const tracked = trackedFile(bytes, "backup.tar.gz");
    const test = createViewerTestContext(tracked.file);
    contexts.push(test);
    const controller = await archiveMetadataViewer.open(test.context);
    expect(test.container.textContent).toContain("未扫描内部归档");
    expect(test.container.textContent).not.toContain("条目列表");
    const payload = { start: 10, end: bytes.length - 8 };
    expect(tracked.ranges.some((range) => overlaps(range, payload))).toBe(false);
    await controller.dispose();
  });

  it("rejects a ZIP whose central directory is truncated", async () => {
    const bytes = zipFixture();
    const eocdOffset = bytes.length - 22 - "archive comment".length;
    const damaged = bytes.slice();
    new DataView(damaged.buffer).setUint32(eocdOffset + 12, 0x7fffffff, true);
    const test = contextFor(damaged, "truncated.zip");
    await expect(archiveMetadataViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(test.container.childElementCount).toBe(0);
  });

  it("trusts recognized magic over a wrong suffix", async () => {
    const test = contextFor(wrapperFixtures["sample.gz"], "wrong.zip", "en-US");
    const controller = await archiveMetadataViewer.open(test.context);
    expect(test.container.textContent).toContain("gzip");
    expect(test.container.textContent).toContain("不一致");
    await controller.dispose();
  });

  it("cleans partial state for invalid files and active aborts", async () => {
    const invalid = contextFor(new TextEncoder().encode("not an archive"), "broken.zip");
    await expect(archiveMetadataViewer.open(invalid.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(invalid.container.childElementCount).toBe(0);

    const active = contextFor(zipFixture(), "active.zip");
    const controller = await archiveMetadataViewer.open(active.context);
    active.abortController.abort();
    expect(active.container.childElementCount).toBe(0);
    await controller.dispose();
  });

  it("aborts a pending range read without waiting for the Blob promise", async () => {
    let resolveRead!: (value: ArrayBuffer) => void;
    const file = {
      size: 8,
      slice() {
        return { arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { resolveRead = resolve; }) };
      },
    } as unknown as File;
    const abortController = new AbortController();
    const reader = new RangeReader(file, abortController.signal);
    const reading = reader.read(0, 4, "header");
    abortController.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    resolveRead(new ArrayBuffer(4));
  });

  it("enforces the cumulative metadata budget before reading", async () => {
    const slice = vi.fn(() => new Blob([new Uint8Array(4)]));
    const file = { size: 8, slice } as unknown as File;
    const reader = new RangeReader(file, new AbortController().signal, 3);
    await expect(reader.read(0, 4, "header")).rejects.toEqual(expect.objectContaining<Partial<ViewerError>>({ code: "resource-limit" }));
    expect(slice).not.toHaveBeenCalled();
  });

  it.each([
    ["archive.zip", "dangerous-path.txt"],
    ["archive.rar", "资料/说明.txt"],
    ["empty-zip64.zip", "ZIP64"],
    ["archive.tar", "long-path.txt"],
    ["archive.tar.gz", "未扫描内部归档"],
    ["archive.tar.xz", "未扫描内部归档"],
    ["archive.tar.zst", "未扫描内部归档"],
    ["sample.gz", "gzip"],
    ["sample.xz", "XZ"],
    ["sample.zst", "Zstandard"],
    ["sample.bz2", "bzip2"],
    ["sample.lz4", "LZ4"],
    ["sample.zlib", "zlib"],
    ["sample.deflate", "raw DEFLATE"],
    ["sample.br", "Brotli"],
  ])("opens the committed example %s", async (name, expected) => {
    const test = exampleContext(name);
    const controller = await archiveMetadataViewer.open(test.context);
    expect(test.container.textContent).toContain(expected);
    await controller.dispose();
  });
});
