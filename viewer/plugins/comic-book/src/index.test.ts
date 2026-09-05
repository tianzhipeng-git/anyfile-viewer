import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { openBookZip } from "@anyfile/archive-metadata-viewer/zip-source";
import { parseComic, comicSpreads, naturalPathCompare } from "./model";
import { comicBookViewer } from "./index";
import { probeComicBook } from "./probe";
const signal = () => new AbortController().signal;
function file(name: string) {
  return new File(
    [readFileSync(resolve(process.cwd(), "../../../docs/ebooks/fixtures", name))],
    name,
  );
}
describe("CBZ reader", () => {
  it("sorts numeric path components consistently", () => {
    expect(
      ["v10/1.png", "v2/10.png", "v2/3.png", "v2/1.png", "v2/2.png"].sort(naturalPathCompare),
    ).toEqual(["v2/1.png", "v2/2.png", "v2/3.png", "v2/10.png", "v10/1.png"]);
  });
  it.each(["pages.cbz", "zip64.cbz", "manga.cbz"])(
    "reads ZIP pages and validated ComicInfo: %s",
    async (name) => {
      expect(await probeComicBook({ file: file(name), signal: signal() })).toBe(4);
      const zip = await openBookZip(file(name), signal()),
        comic = await parseComic(zip, signal());
      expect(comic.pages.map((page) => page.path)).toEqual(
        [1, 2, 3, 4, 10].map((n) => `volume1/${n}.png`),
      );
      expect(comic.rtl).toBe(name === "manga.cbz");
      expect(comicSpreads(comic.pages)).toEqual(
        name === "manga.cbz" ? [[0], [1, 2], [3], [4]] : [[0], [1, 2], [3, 4]],
      );
      await zip.dispose();
    },
  );
  it("rejects a ZIP without image structure during probe", async () => {
    expect(await probeComicBook({ file: file("empty.cbz"), signal: signal() })).toBe(0);
  });
  it("holds only visible and neighboring pages, and cancels rapid switching", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:comic-test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const test = createViewerTestContext(file("hundreds.cbz"));
    try {
      const controller = await comicBookViewer.open(test.context);
      expect(test.container.querySelectorAll("figure")).toHaveLength(1);
      const jump = test.container.querySelector("input")!;
      jump.value = "250";
      jump.dispatchEvent(new Event("change"));
      jump.value = "300";
      jump.dispatchEvent(new Event("change"));
      expect(jump.value).toBe("300");
      test.abortController.abort();
      await controller.dispose();
      await controller.dispose();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(test.container.children).toHaveLength(0);
      expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
      expect(revoke.mock.calls.length).toBeLessThanOrEqual(4);
    } finally {
      test.cleanup();
      vi.restoreAllMocks();
    }
  });
  it("returns a stable encrypted-content state", async () => {
    const test = createViewerTestContext(file("encrypted.cbz"));
    try {
      const controller = await comicBookViewer.open(test.context);
      expect(test.container.textContent).toContain("不支持加密");
      await controller.dispose();
      await controller.dispose();
    } finally {
      test.cleanup();
    }
  });
});
