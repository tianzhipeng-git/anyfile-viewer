import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerError } from "@anyfile/viewer-protocol";
import {
  assertReadsWithin,
  createDeferredFile,
  createTrackedFile,
  createViewerTestContext,
  truncated,
} from "@anyfile/viewer-test";

import { legacyOfficeViewer } from "./index";
import { legacyOfficeManifest } from "./manifest";
import { MAX_FILE_BYTES } from "./model";
import { probeLegacyOffice } from "./probe";

const readExample = (name: string) => readFileSync(join(process.cwd(), "examples", name));

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  vi.restoreAllMocks();
});

function setupFile(bytes: Uint8Array, name: string, locale: "en" | "zh-CN" = "en") {
  const file = new File([Uint8Array.from(bytes)], name);
  const test = createViewerTestContext(file);
  cleanups.push(() => test.cleanup());
  return {
    ...test,
    context: { ...test.context, locale },
  };
}

describe("legacy-office viewer", () => {
  it.each([
    "sample-doc.doc",
    "lists.doc",
    "png-picture.doc",
    "word6.doc",
    "rich-textutil.doc",
    "sample-show.ppt",
    "with-links.ppt",
    "mixed-cjk.ppt",
    "rich-textutil.rtf",
  ])("probes %s at level 3 with bounded header reads", async (name) => {
    const bytes = new Uint8Array(readExample(name));
    const { file, reads } = createTrackedFile(bytes, name);
    const level = await probeLegacyOffice({ file, signal: new AbortController().signal });
    expect(level).toBe(3);
    assertReadsWithin(reads, [{ start: 0, end: 512 }]);
  });

  it("rejects disguised ZIP/DOCX, plain text, and truncated probes cleanly", async () => {
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(600).fill(0)]);
    const textBytes = new TextEncoder().encode("Not a real RTF or CFBF document");
    expect(await probeLegacyOffice({ file: new File([zipBytes], "fake.doc"), signal: new AbortController().signal })).toBe(0);
    expect(await probeLegacyOffice({ file: new File([textBytes], "fake.rtf"), signal: new AbortController().signal })).toBe(0);
    expect(await probeLegacyOffice({ file: new File([textBytes], "fake.ppt"), signal: new AbortController().signal })).toBe(0);
  });

  it("renders real Word 97-2003 (.doc) samples with headings, lists, tables, page breaks, and pictures", async () => {
    const sample = setupFile(readExample("sample-doc.doc"), "sample-doc.doc");
    const preview = vi.fn();
    const c1 = await legacyOfficeViewer.open({ ...sample.context, reportPreview: preview });
    expect(sample.container.textContent).toContain("I am a test document");
    expect(sample.container.textContent).toContain("This is page two");
    expect(sample.container.querySelector("hr.anyfile-legacy-office__page-break")).not.toBeNull();
    expect(preview).toHaveBeenCalledWith({ outcome: "success", kind: "static" });
    c1.dispose();
    expect(sample.container.children).toHaveLength(0);

    const lists = setupFile(readExample("lists.doc"), "lists.doc");
    const c2 = await legacyOfficeViewer.open(lists.context);
    expect(lists.container.querySelector("h1")?.textContent).toContain("Heading Level 1");
    expect(lists.container.querySelectorAll(".anyfile-legacy-office__list-item").length).toBeGreaterThan(0);
    c2.dispose();

    const rich = setupFile(readExample("rich-textutil.doc"), "rich-textutil.doc", "zh-CN");
    const c3 = await legacyOfficeViewer.open(rich.context);
    expect(rich.container.textContent).toContain("中文测试");
    expect(rich.container.querySelector("table")?.textContent).toContain("Column A");
    expect(rich.container.querySelector("table")?.textContent).toContain("Alpha");
    c3.dispose();

    const createUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:legacy-office-test-img");
    const revokeUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const pic = setupFile(readExample("png-picture.doc"), "png-picture.doc");
    const c4 = await legacyOfficeViewer.open(pic.context);
    expect(pic.container.textContent).toContain("The quick brown fox jumps over the lazy dog");
    const imgs = pic.container.querySelectorAll("img");
    expect(imgs.length).toBeGreaterThan(0);
    expect(createUrlSpy).toHaveBeenCalled();
    c4.dispose();
    c4.dispose();
    expect(revokeUrlSpy).toHaveBeenCalledTimes(createUrlSpy.mock.calls.length);
  });

  it("renders legacy Word 6.0 (.doc) files", async () => {
    const w6 = setupFile(readExample("word6.doc"), "word6.doc");
    const controller = await legacyOfficeViewer.open(w6.context);
    expect(w6.container.textContent).toContain("The quick brown fox jumps over the lazy dog");
    controller.dispose();
  });

  it("renders real PowerPoint (.ppt) decks with slides, formatting, links, CJK text, and speaker notes", async () => {
    const show = setupFile(readExample("sample-show.ppt"), "sample-show.ppt");
    const c1 = await legacyOfficeViewer.open(show.context);
    expect(show.container.querySelectorAll(".anyfile-legacy-office__slide-card")).toHaveLength(2);
    expect(show.container.textContent).toContain("Title of the first slide");
    expect(show.container.textContent).toContain("This is the second slide");
    expect(show.container.textContent).toContain("I am the notes of the first slide");
    expect(show.container.textContent).toContain("THIS LINE IS BOLD");

    const modeBtn = Array.from(show.container.querySelectorAll("button")).find((b) => b.textContent === "Single slide")!;
    modeBtn.click();
    const cards = Array.from(show.container.querySelectorAll<HTMLElement>(".anyfile-legacy-office__slide-card"));
    expect(cards.map((el) => el.hidden)).toEqual([false, true]);
    c1.dispose();

    const links = setupFile(readExample("with-links.ppt"), "with-links.ppt");
    const c2 = await legacyOfficeViewer.open(links.context);
    expect(links.container.textContent).toContain("I am the title of the first page");
    expect(links.container.textContent).toContain("I am page two");
    const anchors = Array.from(links.container.querySelectorAll("a"));
    expect(anchors.some((a) => a.href.startsWith("http://jakarta.apache.org/"))).toBe(true);
    expect(anchors.every((a) => a.rel === "noreferrer noopener")).toBe(true);
    c2.dispose();

    const cjk = setupFile(readExample("mixed-cjk.ppt"), "mixed-cjk.ppt");
    const c3 = await legacyOfficeViewer.open(cjk.context);
    expect(cjk.container.textContent).toContain("複数の文字");
    expect(cjk.container.textContent).toContain("𠮟Mix");
    c3.dispose();
  });

  it("renders real RTF documents and sanitizes unsafe hyperlinks", async () => {
    const rtf = setupFile(readExample("rich-textutil.rtf"), "rich-textutil.rtf");
    const c1 = await legacyOfficeViewer.open(rtf.context);
    expect(rtf.container.textContent).toContain("Legacy Office Document");
    expect(rtf.container.textContent).toContain("中文测试");
    expect(rtf.container.querySelector("table")?.textContent).toContain("100");
    c1.dispose();

    const customRtf = new TextEncoder().encode(
      "{\\rtf1\\ansi\\ansicpg936{\\info{\\title Report Title}{\\author Alice}}"
      + "{\\stylesheet{\\s1 Heading 1;}}{\\colortbl;\\red255\\green0\\blue0;}"
      + "\\pard\\s1\\b Title\\par"
      + "\\pard\\plain\\cf1 \\'d6\\'d0\\'ce\\'c4 \\u27979?\\u-29729? "
      + "{\\field{\\*\\fldinst HYPERLINK \"javascript:alert(1)\"}{\\fldrslt unsafe}} "
      + "{\\field{\\*\\fldinst HYPERLINK \"https://example.com/docs\"}{\\fldrslt safeLink}}\\par}",
    );
    const custom = setupFile(customRtf, "custom.rtf");
    const c2 = await legacyOfficeViewer.open(custom.context);
    expect(custom.container.querySelector("h1")?.textContent).toBe("Title");
    expect(custom.container.textContent).toContain("中文");
    expect(custom.container.textContent).toContain("Report Title");
    const links = Array.from(custom.container.querySelectorAll("a"));
    expect(links).toHaveLength(1);
    expect(links[0]?.href).toBe("https://example.com/docs");
    expect(links[0]?.rel).toBe("noreferrer noopener");
    c2.dispose();
  });

  it("supports RTF saved with a .doc extension", async () => {
    const bytes = readExample("rich-textutil.rtf");
    const { file } = createTrackedFile(new Uint8Array(bytes), "saved-as-doc.doc");
    expect(await probeLegacyOffice({ file, signal: new AbortController().signal })).toBe(3);
    const ctx = setupFile(bytes, "saved-as-doc.doc");
    const controller = await legacyOfficeViewer.open(ctx.context);
    expect(ctx.container.textContent).toContain("Legacy Office Document");
    controller.dispose();
  });

  it("rejects encrypted, corrupted, truncated, and disguised files cleanly", async () => {
    for (const badName of ["unsupported-encrypted.doc", "unsupported-encrypted.ppt"]) {
      const ctx = setupFile(readExample(badName), badName);
      await expect(legacyOfficeViewer.open(ctx.context)).rejects.toMatchObject({
        name: "ViewerError",
        code: "invalid-file",
      });
      expect(ctx.container.children).toHaveLength(0);
    }

    const truncDoc = truncated(new Uint8Array(readExample("sample-doc.doc")), 600);
    const truncCtx = setupFile(truncDoc, "truncated.doc");
    await expect(legacyOfficeViewer.open(truncCtx.context)).rejects.toBeInstanceOf(ViewerError);
    expect(truncCtx.container.children).toHaveLength(0);

    // Valid CFBF PPT file opened as .doc must fail (missing WordDocument stream)
    const wrongExt = setupFile(readExample("sample-show.ppt"), "disguised.doc");
    await expect(legacyOfficeViewer.open(wrongExt.context)).rejects.toMatchObject({
      code: "invalid-file",
    });
    expect(wrongExt.container.children).toHaveLength(0);
  });

  it("enforces file size and RTF nesting resource limits", async () => {
    const oversized = {
      name: "huge.doc",
      size: MAX_FILE_BYTES + 1,
      slice() { return new Blob([]); },
    } as unknown as File;
    const test = createViewerTestContext(oversized);
    cleanups.push(() => test.cleanup());
    await expect(legacyOfficeViewer.open(test.context)).rejects.toMatchObject({
      code: "resource-limit",
    });

    const deepRtf = new TextEncoder().encode(`{\\rtf1${"{".repeat(140)}x${"}".repeat(140)}}`);
    const deepCtx = setupFile(deepRtf, "deep.rtf");
    await expect(legacyOfficeViewer.open(deepCtx.context)).rejects.toMatchObject({
      code: "resource-limit",
    });
  });

  it("handles abort during opening and after active mounting with zero side effects", async () => {
    const deferred = createDeferredFile("pending.doc", 1024);
    const test = createViewerTestContext(deferred.file);
    cleanups.push(() => test.cleanup());
    const openPromise = legacyOfficeViewer.open(test.context);
    test.abortController.abort();
    await expect(openPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(test.container.children).toHaveLength(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");

    const active = setupFile(readExample("sample-doc.doc"), "active.doc");
    const controller = await legacyOfficeViewer.open(active.context);
    expect(active.container.children).toHaveLength(1);
    active.abortController.abort();
    expect(active.container.children).toHaveLength(0);
    expect(() => controller.dispose()).not.toThrow();
    expect(legacyOfficeManifest.id).toBe("legacy-office");
  });
});
