import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, truncated, type ViewerTestContext } from "@anyfile/viewer-test";
import { gzipSync, unzipSync, zipSync } from "fflate";

import { iworkViewer } from "./index";

const contexts: ViewerTestContext[] = [];

function bytes(name: string) {
  return new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
}

function sample(name: string, rename = name) {
  return new File([bytes(name)], rename);
}

function context(file: File) {
  const result = createViewerTestContext(file);
  contexts.push(result);
  return result;
}

function texts(test: ViewerTestContext, selector: string) {
  return Array.from(test.container.querySelectorAll(selector), (node) => node.textContent);
}

let created = 0;
beforeEach(() => {
  created = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:iwork-${++created}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const item of contexts.splice(0)) item.cleanup();
  vi.restoreAllMocks();
});

describe("iWork viewer", () => {
  it("extracts Pages 2013+ body text, text boxes and the saved preview", async () => {
    const test = context(sample("testPages2013.pages"));
    const controller = await iworkViewer.open(test.context);

    const body = texts(test, ".anyfile-iwork__text p");
    expect(body[0]).toBe("Sample pages document");
    expect(body).toContain("Some plain text to parse.");
    expect(body.some((text) => text?.startsWith("Both Pages 1.x and Keynote 2.x"))).toBe(true);
    expect(body).toContain("A text box with text.");
    expect(body.join("")).not.toContain("\uFFFC");
    expect(test.container.querySelector<HTMLImageElement>(".anyfile-iwork__preview")?.getAttribute("src")).toMatch(/^blob:iwork-/);
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(created);
  });

  it("orders Keynote 2013+ slides by the slide tree with thumbnails and presenter notes", async () => {
    const test = context(sample("testKeynote2013.key"));
    await iworkViewer.open(test.context);

    const slides = Array.from(test.container.querySelectorAll(".anyfile-iwork__slide"));
    expect(slides).toHaveLength(3);
    // The title placeholder comes first even though its storage is stored after the subtitle.
    expect(Array.from(slides[0]!.querySelectorAll("p"), (p) => p.textContent)).toEqual(["A sample presentation", "For the Apache Tika project"]);
    expect(slides[1]?.textContent).toContain("Some random text for the sake of testability.");
    expect(slides[1]?.querySelector(".anyfile-iwork__notes")?.textContent).toContain("A nice note");
    expect(slides.every((slide) => slide.querySelector("img"))).toBe(true);
    expect(test.container.textContent).toContain("3 张幻灯片");
  });

  it("reads the IWA streams of a zipped Keynote bundle through its nested Index.zip", async () => {
    const test = context(sample("testKeynote2018.key"));
    await iworkViewer.open(test.context);

    expect(test.container.querySelectorAll(".anyfile-iwork__slide").length).toBeGreaterThan(0);
    expect(test.container.textContent).toContain("iWork 2013+");
  });

  it("extracts iWork '09 Pages and Keynote XML", async () => {
    const pages = context(sample("testPages.pages"));
    await iworkViewer.open(pages.context);
    expect(pages.container.textContent).toContain("iWork '09");
    expect(texts(pages, ".anyfile-iwork__text p").length).toBeGreaterThan(5);

    const xml = unzipSync(bytes("testPages.pages"))["index.xml"]!;
    const gzipped = context(new File([zipSync({ "index.xml.gz": gzipSync(xml) })], "gzipped.pages"));
    await iworkViewer.open(gzipped.context);
    expect(texts(gzipped, ".anyfile-iwork__text p")).toEqual(texts(pages, ".anyfile-iwork__text p"));

    const keynote = context(sample("testKeynote.key"));
    await iworkViewer.open(keynote.context);
    const slides = Array.from(keynote.container.querySelectorAll(".anyfile-iwork__slide"));
    expect(slides).toHaveLength(3);
    expect(slides[1]?.textContent).toContain("Some random text for the sake of testability.");
    expect(slides[1]?.querySelector(".anyfile-iwork__notes")?.textContent).toContain("A nice note");
    expect(slides[0]?.querySelector("img")).not.toBeNull();
  });

  it("reports password-protected documents explicitly", async () => {
    const test = context(sample("testPagesPwdProtected.pages"));
    await expect(iworkViewer.open(test.context)).rejects.toMatchObject({ code: "open-failed", message: expect.stringContaining("密码") });
    expect(test.container.childElementCount).toBe(0);

    const iwa = context(new File([zipSync({ "Index/Document.iwa": new Uint8Array(4), ".iwpv2": new Uint8Array(4) })], "locked.pages"));
    await expect(iworkViewer.open(iwa.context)).rejects.toMatchObject({ code: "open-failed" });
  });

  it("rejects corrupt, truncated and disguised packages without leaving DOM", async () => {
    const corrupt = context(new File([zipSync({ "Index/Document.iwa": new Uint8Array([0, 9, 0, 0, 1, 2]) })], "bad.pages"));
    await expect(iworkViewer.open(corrupt.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(corrupt.container.childElementCount).toBe(0);

    const cut = context(new File([new Uint8Array(truncated(bytes("testPages2013.pages"), 4096))], "cut.pages"));
    await expect(iworkViewer.open(cut.context)).rejects.toMatchObject({ code: "invalid-file" });

    const keynoteAsPages = context(sample("testKeynote2013.key", "slides.pages"));
    await expect(iworkViewer.open(keynoteAsPages.context)).rejects.toMatchObject({ code: "invalid-file" });
  });

  it("refuses IWA streams that claim more output than the expansion budget", async () => {
    // Snappy header claiming a 2^30-byte block inside a 9-byte chunk.
    const bomb = new Uint8Array([0, 5, 0, 0, 0x80, 0x80, 0x80, 0x80, 0x04]);
    const test = context(new File([zipSync({ "Index/Document.iwa": bomb })], "bomb.pages"));
    await expect(iworkViewer.open(test.context)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("stops cleanly when aborted while opening or after activation", async () => {
    const opening = context(sample("testPages2013.pages"));
    const pending = iworkViewer.open(opening.context);
    opening.abortController.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(opening.container.childElementCount).toBe(0);

    const active = context(sample("testPages2013.pages"));
    const controller = await iworkViewer.open(active.context);
    const progressCount = active.progress.length;
    active.abortController.abort();
    expect(active.container.childElementCount).toBe(0);
    await controller.dispose();
    expect(active.progress).toHaveLength(progressCount);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(created);
  });
});
