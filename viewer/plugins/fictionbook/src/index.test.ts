import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { parseFictionBook, FB2_LIMITS } from "./publication";
import { fictionBookViewer } from "./index";
import { probeFictionBook } from "./probe";
const signal = () => new AbortController().signal;
const bytes = (name: string) => new Uint8Array(readFileSync(resolve(process.cwd(), "../../../docs/ebooks/fixtures", name)));
const file = (name: string) => new File([bytes(name)], name);
const contexts: ReturnType<typeof createViewerTestContext>[] = [];
beforeEach(() => {
  const parse = DOMParser.prototype.parseFromString;
  vi.spyOn(DOMParser.prototype, "parseFromString").mockImplementation(function (this: DOMParser, ...args) {
    const doc = parse.apply(this, args);
    for (const node of Array.from(doc.querySelectorAll("*"))) {
      const value = node.getAttribute("l:href");
      if (value !== null) { node.removeAttribute("l:href"); node.setAttributeNS("http://www.w3.org/1999/xlink", "l:href", value); }
    }
    return doc;
  });
});
afterEach(() => { for (const context of contexts.splice(0)) context.cleanup(); vi.restoreAllMocks(); });
it.each(["normal.fb2", "utf16.fb2", "utf16be.fb2", "cp1251.fb2"])("reads structure, metadata and encoding: %s", async (name) => {
  expect(await probeFictionBook({ file: file(name), signal: signal() })).toBe(4);
  const book = parseFictionBook(bytes(name), signal());
  expect(book.title).toBe(name === "cp1251.fb2" ? "Книга" : "Original fixture");
  expect(book.author).toBe("Local Author");
  expect(book.spine).toHaveLength(6);
  expect(book.toc.some((item) => item.label === "Nested 3")).toBe(true);
  expect(book.anchors.get("note")).toBe("section-5");
});
it.each(["normal.fb2.zip", "single-fb2.zip"])("opens a single main book: %s", async (name) => {
  expect(await probeFictionBook({ file: file(name), signal: signal() })).toBe(4);
  const test = createViewerTestContext(file(name)); contexts.push(test);
  const controller = await fictionBookViewer.open(test.context);
  expect(test.container.textContent).toContain("Original fixture");
  await controller.dispose(); await controller.dispose();
  expect(test.container.children).toHaveLength(0);
  expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
});
it("does not claim arbitrary XML or multi-book ZIPs", async () => {
  expect(await probeFictionBook({ file: file("multiple-fb2.zip"), signal: signal() })).toBe(0);
  expect(await probeFictionBook({ file: new File(["<x/>"], "x.fb2"), signal: signal() })).toBe(0);
  expect(await probeFictionBook({ file: new File([bytes("pages.cbz")], "pages.zip"), signal: signal() })).toBe(0);
});
it("maps poetry, tables, notes and images without active HTML or remote references", async () => {
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:book-test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const book = parseFictionBook(bytes("malicious.fb2"), signal());
  expect(create).not.toHaveBeenCalled();
  const chapter = await book.loadSection("section-0", signal());
  expect(chapter.html).toContain("First verse"); expect(chapter.html).toContain("<table>");
  expect(chapter.html).toContain("blob:book-test"); expect(chapter.html).toContain("Content-Security-Policy");
  expect(chapter.html).not.toMatch(/<script|onclick|javascript:|ebook\.invalid/);
  expect(chapter.links).toContainEqual({ path: "section-5", fragment: "note" });
  chapter.dispose(); chapter.dispose(); expect(revoke).toHaveBeenCalledTimes(1);
});
it.each([["entity.fb2", "invalid-file"], ["invalid.fb2", "invalid-file"], ["deep.fb2", "resource-limit"], ["huge-binary.fb2", "resource-limit"]])("classifies %s and cleans failed opens", async (name, code) => {
  const test = createViewerTestContext(file(name)); contexts.push(test);
  await expect(fictionBookViewer.open(test.context)).rejects.toMatchObject({ code });
  expect(test.container.children).toHaveLength(0);
});
it("rejects invalid encoding and oversized input before DOM parsing", () => {
  expect(() => parseFictionBook(new Uint8Array([0xff, 0xff]), signal())).toThrow();
  expect(() => parseFictionBook(new Uint8Array(FB2_LIMITS.file + 1), signal())).toThrow(expect.objectContaining({ code: "resource-limit" }));
});
it("cancels opening, mapping and active resources without late progress", async () => {
  const test = createViewerTestContext(file("normal.fb2")); contexts.push(test);
  const controller = await fictionBookViewer.open(test.context);
  const count = test.progress.length;
  test.abortController.abort(); await controller.dispose(); await controller.dispose();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(test.container.children).toHaveLength(0); expect(test.progress).toHaveLength(count);
  await expect(fictionBookViewer.open(test.context)).rejects.toMatchObject({ name: "AbortError" });
  const book = parseFictionBook(bytes("normal.fb2"), signal());
  const abort = new AbortController();
  const mapping = book.loadSection("section-0", abort.signal); abort.abort();
  await expect(mapping).rejects.toMatchObject({ name: "AbortError" });
});

it("assigns stable IDs to nested sections without author IDs", () => {
  const source = new TextDecoder().decode(bytes("normal.fb2")).replace(/ id="nested1"/, "");
  const book = parseFictionBook(new TextEncoder().encode(source), signal());
  expect(book.toc.find((item) => item.label === "Nested 1")?.fragment).toMatch(/^fb2-section-/);
});
it("rejects duplicate IDs, malformed base64 and excessive chapter text", async () => {
  const source = new TextDecoder().decode(bytes("normal.fb2"));
  expect(() => parseFictionBook(new TextEncoder().encode(source.replace('id="c2"', 'id="c1"')), signal())).toThrow(expect.objectContaining({ code: "invalid-file" }));
  const malformed = source.replace(/(<binary[^>]*>)[^<]+/, "$1@@@");
  await expect(parseFictionBook(new TextEncoder().encode(malformed), signal()).loadSection("section-0", signal())).rejects.toMatchObject({ code: "invalid-file" });
  const oversized = source.replace("Local reading.", "x".repeat(FB2_LIMITS.chapter + 1));
  await expect(parseFictionBook(new TextEncoder().encode(oversized), signal()).loadSection("section-0", signal())).rejects.toMatchObject({ code: "resource-limit" });
});
it("keeps text with a local warning when the cover binary is absent", async () => {
  const book = parseFictionBook(bytes("normal.fb2"), signal()); book.binaries.clear();
  const chapter = await book.loadSection("section-0", signal());
  expect(chapter.missingResources).toBe(1); expect(chapter.html).toContain("Local reading."); chapter.dispose();
});
it("aborts while the initial file read is pending without mounting stale DOM", async () => {
  const input = file("normal.fb2");
  let finish!: () => void;
  vi.spyOn(input, "arrayBuffer").mockImplementation(() => new Promise((resolve) => {
    finish = () => resolve(new ArrayBuffer(0));
  }));
  const test = createViewerTestContext(input); contexts.push(test);
  const opening = fictionBookViewer.open(test.context);
  const progress = test.progress.length;
  test.abortController.abort(); finish();
  await expect(opening).rejects.toMatchObject({ name: "AbortError" });
  expect(test.container.children).toHaveLength(0);
  expect(test.progress).toHaveLength(progress);
});
