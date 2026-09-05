import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { inspectMobi, probeMobi } from "./probe";
import { mobiViewer } from "./index";
import { prepareChapter } from "@anyfile/rendering-publication/safe-content";
import type { Publication } from "@anyfile/rendering-publication/markup";
const signal = () => new AbortController().signal;
const file = (name: string) => new File([readFileSync(resolve("../../../docs/ebooks/fixtures/phase45", name))], name);
describe("MOBI routing and safe chapters", () => {
  it.each(["mobi7.mobi", "uncompressed.mobi", "huffman.mobi", "kf8.azw3", "joint.mobi", "palmdoc.pdb", "palmdoc-compressed.prc"])("recognizes %s with bounded reads", async name => {
    const input = file(name); vi.spyOn(input, "arrayBuffer").mockRejectedValue(new Error("Whole file read"));
    expect(await probeMobi({ file: input, signal: signal() })).toBe(3);
    expect(await inspectMobi(input, signal(), true)).not.toBeNull();
  });
  it("rejects an extreme record-count header during routing", async () => {
    expect(await probeMobi({ file: file("records.mobi"), signal: signal() })).toBe(0);
  });
  it("does not claim arbitrary PDB or KFX content", async () => {
    expect(await probeMobi({ file: new File([new Uint8Array(100)], "data.pdb"), signal: signal() })).toBe(0);
  });
  it.each([["offset.mobi", "invalid-file"], ["bomb.mobi", "resource-limit"]])("rejects %s before Worker creation", async (name, code) => {
    await expect(inspectMobi(file(name), signal(), true)).rejects.toMatchObject({ code });
  });
  it("preserves abort and cleans DRM state without touching the host", async () => {
    const test = createViewerTestContext(file("drm.azw"));
    try {
      const controller = await mobiViewer.open(test.context);
      expect(test.container.textContent).toContain("DRM");
      test.abortController.abort(); await controller.dispose(); await controller.dispose();
      expect(test.container.children).toHaveLength(0);
      expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
      await expect(mobiViewer.open(test.context)).rejects.toMatchObject({ name: "AbortError" });
    } finally { test.cleanup(); }
  });
  it("rebuilds legacy HTML, preserving font text and dropping active content", async () => {
    const path = "part00000.html";
    const item = { id: path, path, type: "text/html", properties: [] };
    const book: Publication = { title: "", author: "", direction: "ltr", items: new Map([[path, item]]), spine: [item], toc: [] };
    let text = '<font color="red">Readable heading</font><mbp:pagebreak/><p id="target">Body</p><a href="#target">Link</a><script>attack()</script><img src="https://ebook.invalid/a"><iframe src="https://ebook.invalid/b"></iframe><form action="https://ebook.invalid/c">Hidden form</form>';
    const source = { entries: new Map(), read: async () => new TextEncoder().encode(text), dispose: async () => {} };
    const chapter = await prepareChapter(source, book, path, signal());
    expect(chapter.html).toContain("Readable heading");
    expect(chapter.html).toContain("Body");
    expect(chapter.html).not.toMatch(/ebook.invalid|attack\(\)|<script|<iframe|<form/);
    expect(chapter.links).toEqual([{ path, fragment: "target" }]); chapter.dispose();
    item.type = "text/plain"; text = '<script>literal PalmDOC</script>';
    const plain = await prepareChapter(source, book, path, signal());
    expect(plain.html).toContain("&lt;script&gt;literal PalmDOC&lt;/script&gt;"); plain.dispose();
  });
  it("bounds legacy HTML nodes and depth before reconstruction", async () => {
    const path = "part00000.html", item = { id: path, path, type: "text/html", properties: [] };
    const book: Publication = { title: "", author: "", direction: "ltr", items: new Map([[path,item]]), spine: [item], toc: [] };
    const source = { entries: new Map(), read: async () => new TextEncoder().encode('<div>'.repeat(100)+'x'+'</div>'.repeat(100)), dispose: async () => {} };
    await expect(prepareChapter(source, book, path, signal())).rejects.toMatchObject({ code: "resource-limit" });
  });
});
