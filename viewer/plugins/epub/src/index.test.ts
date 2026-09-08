import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { openBookZip } from "@anyfile/archive-metadata-viewer/zip-source";
import { parsePublication, localReference, parseXml } from "./publication";
import { prepareChapter } from "./safe-content";
import { epubViewer } from "./index";
import { probeEpub } from "./probe";
const contexts: ReturnType<typeof createViewerTestContext>[] = [];
const signal = () => new AbortController().signal;
function file(name: string) {
  return new File(
    [readFileSync(resolve(process.cwd(), "../../../docs/ebooks/fixtures", name))],
    name,
  );
}
afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
  vi.restoreAllMocks();
});
describe("EPUB local reader", () => {
  it.each(["epub2.epub", "epub3.epub", "rtl.epub"])(
    "reads metadata, spine and navigation: %s",
    async (name) => {
      const input = file(name);
      expect(await probeEpub({ file: input, signal: signal() })).toBe(4);
      const zip = await openBookZip(input, signal());
      const book = await parsePublication(zip, signal());
      expect(book.title).toBe("Local reading fixture");
      expect(book.spine).toHaveLength(5);
      expect(book.toc.map((item) => item.label)).toEqual(
        [1, 2, 3, 4, 5].map((n) => `Chapter ${n}`),
      );
      expect(book.direction).toBe(name === "rtl.epub" ? "rtl" : "ltr");
      await zip.dispose();
    },
  );
  it("sanitizes scripts, forms, network, navigation, CSS and resources before iframe insertion", async () => {
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => `blob:test-${Math.random()}`);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const zip = await openBookZip(file("malicious.epub"), signal()),
      book = await parsePublication(zip, signal());
    const chapter = await prepareChapter(zip, book, book.spine[0].path, signal());
    expect(chapter.html).toContain("Chapter 1");
    expect(chapter.html).toContain("blob:test-");
    expect(chapter.html).not.toMatch(
      /ebook\.invalid|<script|<iframe|<form|<object|onerror|javascript:|foreignObject/,
    );
    expect(chapter.html).toContain("Content-Security-Policy");
    expect(chapter.links).toContainEqual({ path: "OPS/chapter2.xhtml", fragment: "p12" });
    chapter.dispose();
    chapter.dispose();
    expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);
    await zip.dispose();
  });
  it.each([
    ["missing-spine.epub", "missing-related-file"],
    ["entity.epub", "invalid-file"],
    ["large-chapter.epub", "resource-limit"],
  ])("classifies %s", async (name, code) => {
    const test = createViewerTestContext(file(name));
    contexts.push(test);
    await expect(epubViewer.open(test.context)).rejects.toMatchObject({ code });
    expect(test.container.children.length).toBe(0);
  });
  it("bounds XML depth and rejects path escapes and external references", async () => {
    expect(() =>
      parseXml(new TextEncoder().encode("<x>" + "<y>".repeat(80) + "</y>".repeat(80) + "</x>")),
    ).toThrow(expect.objectContaining({ code: "resource-limit" }));
    expect(localReference("OPS/chapters/one.xhtml", "../images/a%20b.png#here")).toEqual({
      path: "OPS/images/a b.png",
      fragment: "here",
    });
    for (const path of [
      "../../../outside",
      "https://example.com",
      "//evil",
      "%2e%2e/%2e%2e/outside",
      "javascript:alert(1)",
    ])
      expect(localReference("OPS/book.xhtml", path)).toBeNull();
  });
  it("shows a stable protected state and disposes only owned DOM", async () => {
    const test = createViewerTestContext(file("drm.epub"));
    contexts.push(test);
    const controller = await epubViewer.open(test.context);
    expect(test.container.textContent).toContain("不会尝试解密");
    await controller.dispose();
    await controller.dispose();
    expect(test.container.children).toHaveLength(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
  });
  it("stops opening and active chapters on abort without late progress", async () => {
    const test = createViewerTestContext(file("epub3.epub"));
    contexts.push(test);
    const controller = await epubViewer.open(test.context);
    const count = test.progress.length;
    test.abortController.abort();
    await controller.dispose();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(test.container.children).toHaveLength(0);
    expect(test.progress).toHaveLength(count);
    await expect(epubViewer.open(test.context)).rejects.toMatchObject({ name: "AbortError" });
  });
});
