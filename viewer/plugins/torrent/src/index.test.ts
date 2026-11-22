import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest, type Locale } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { decodeBencode, BencodeError } from "./bencode";
import { bittorrentViewer } from "./index";
import { bittorrentManifest } from "./manifest";
import { MAX_TORRENT_BYTES, readTorrent } from "./parse";

const SAMPLE = join(dirname(fileURLToPath(import.meta.url)), "../examples/sintel.torrent");
const sampleBytes = new Uint8Array(readFileSync(SAMPLE));

const contexts: ViewerTestContext[] = [];

function contextFor(contents: BlobPart | Uint8Array, name = "sample.torrent", locale: Locale = "zh-CN") {
  const body = contents instanceof Uint8Array ? contents.slice().buffer as ArrayBuffer : contents;
  const test = createViewerTestContext(new File([body], name, { type: "application/x-bittorrent" }));
  contexts.push(test);
  return { ...test, context: { ...test.context, locale } };
}

const encode = (value: string) => new TextEncoder().encode(value);

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
});

describe("bencode decoder", () => {
  it("decodes integers, strings, lists and dictionaries", () => {
    expect(decodeBencode(encode("i42e"))).toBe(42);
    expect(new TextDecoder().decode(decodeBencode(encode("4:spam")) as Uint8Array)).toBe("spam");
    expect(decodeBencode(encode("l3:abci1ee"))).toEqual([encode("abc"), 1]);
    const dict = decodeBencode(encode("d3:foo3:bare")) as Record<string, Uint8Array>;
    expect(new TextDecoder().decode(dict.foo)).toBe("bar");
  });

  it("rejects malformed input", () => {
    expect(() => decodeBencode(encode("i12"))).toThrow(BencodeError);
    expect(() => decodeBencode(encode("5:abc"))).toThrow(BencodeError);
    expect(() => decodeBencode(encode("d3:foo3:barbad"))).toThrow(BencodeError); // trailing bytes
  });

  it("handles Object.prototype key names in dictionaries without collision", () => {
    const dict = decodeBencode(encode("d11:constructori1e8:toStringi2e9:__proto__i3ee")) as Record<string, number>;
    expect(Object.getPrototypeOf(dict)).toBeNull();
    expect(dict.constructor).toBe(1);
    expect(dict.toString).toBe(2);
    expect(dict["__proto__"]).toBe(3);
  });
});

describe("torrent parser", () => {
  it("derives file list, trackers, sizes and infohash from a real torrent", async () => {
    const controller = new AbortController();
    const doc = await readTorrent(new File([sampleBytes.slice().buffer as ArrayBuffer], "sintel.torrent"), controller.signal, () => {});
    expect(doc.name).toBe("Sintel");
    expect(doc.files).toHaveLength(11);
    expect(doc.files.map((file) => file.path)).toContain("Sintel.mp4");
    expect(doc.totalSize).toBeGreaterThan(0);
    expect(doc.trackers.length).toBeGreaterThanOrEqual(8);
    expect(doc.webSeeds).toHaveLength(1);
    expect(doc.isPrivate).toBe(false);
    expect(doc.pieceLength).toBeGreaterThan(0);
    expect(doc.pieceCount).toBeGreaterThan(0);
    expect(doc.infoHash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("rejects truncated and non-torrent input", async () => {
    const controller = new AbortController();
    await expect(readTorrent(new File([sampleBytes.slice(0, 100).buffer as ArrayBuffer], "broken.torrent"), controller.signal, () => {}))
      .rejects.toMatchObject({ code: "invalid-file" });
    await expect(readTorrent(new File(["plain text, not bencode"], "fake.torrent"), controller.signal, () => {}))
      .rejects.toMatchObject({ code: "invalid-file" });
  });

  it("enforces the input size limit", async () => {
    const oversized = { name: "big.torrent", size: MAX_TORRENT_BYTES + 1 } as File;
    await expect(readTorrent(oversized, new AbortController().signal, () => {}))
      .rejects.toMatchObject({ code: "resource-limit" });
  });
});

describe("BitTorrent viewer", () => {
  it("publishes a valid manifest", () => {
    expect(() => validateManifest(bittorrentManifest)).not.toThrow();
    expect(bittorrentManifest.formats[0].extensions).toEqual([".torrent"]);
  });

  it("renders metadata and the file tree from the real sample", async () => {
    const test = contextFor(sampleBytes);
    const reportPreview = vi.fn();
    const directRead = vi.spyOn(test.context.file, "arrayBuffer");
    const controller = await bittorrentViewer.open({ ...test.context, reportPreview });

    expect(test.container.textContent).toContain("Sintel");
    expect(test.container.textContent).toContain("Sintel.mp4");
    expect(test.container.textContent).toContain("InfoHash");
    expect(test.container.textContent).toContain("Tracker");
    expect(test.container.querySelectorAll(".anyfile-torrent-viewer__table tbody tr").length).toBeGreaterThan(5);
    expect(directRead).not.toHaveBeenCalled();
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(reportPreview).toHaveBeenCalledExactlyOnceWith({ outcome: "success", kind: "structure" });

    const filter = test.container.querySelector<HTMLInputElement>("[data-torrent-filter]")!;
    filter.value = "poster";
    filter.dispatchEvent(new Event("input"));
    expect(test.container.textContent).toContain("poster.jpg");
    expect(test.container.textContent).not.toContain("Sintel.mp4");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("disposes an active view when aborted after opening", async () => {
    const test = contextFor(sampleBytes);
    await bittorrentViewer.open(test.context);
    expect(test.container.childElementCount).toBe(1);
    test.abortController.abort();
    expect(test.container.childElementCount).toBe(0);
  });

  it("rejects an invalid file through open() with localized messages", async () => {
    const zh = contextFor("d4:infod4:name0:e", "invalid.torrent", "zh-CN");
    await expect(bittorrentViewer.open(zh.context)).rejects.toMatchObject({
      code: "invalid-file",
      message: expect.stringContaining("种子文件"),
    });
    expect(zh.container.childElementCount).toBe(0);

    const en = contextFor("not a torrent", "invalid.torrent", "en");
    await expect(bittorrentViewer.open(en.context)).rejects.toMatchObject({
      code: "invalid-file",
      message: "The file is damaged or is not a valid torrent file.",
    });
    expect(en.container.childElementCount).toBe(0);

    const oversized = { name: "big.torrent", size: MAX_TORRENT_BYTES + 1 } as File;
    await expect(readTorrent(oversized, new AbortController().signal, () => {}, "en"))
      .rejects.toMatchObject({ code: "resource-limit", message: expect.stringContaining("32 MiB") });
  });

  it("cancels a pending read during opening", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const file = { name: "pending.torrent", size: 4096, slice() { return { stream: () => stream }; } } as unknown as File;
    const test = createViewerTestContext(file);
    contexts.push(test);
    const opening = bittorrentViewer.open(test.context);
    test.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
    expect(test.container.childElementCount).toBe(0);
  });
});
