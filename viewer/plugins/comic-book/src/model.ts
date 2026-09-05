import { ViewerError } from "@anyfile/viewer-protocol";
import type { BookSource } from "@anyfile/archive-metadata-viewer/book-source";
export interface ComicPage {
  path: string;
  type: string;
  double: boolean;
}
export const COMIC_LIMITS = {
  pages: 5000,
  pageBytes: 16 * 1024 * 1024,
  pixels: 8_000_000,
  livePages: 5,
};
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "variant" });
export function naturalPathCompare(a: string, b: string) {
  const left = a.split("/"),
    right = b.split("/");
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const order = collator.compare(left[i], right[i]);
    if (order) return order;
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return left.length - right.length;
}
export async function parseComic(zip: BookSource, signal: AbortSignal) {
  const pages: ComicPage[] = [...zip.entries.values()]
    .filter(
      (entry) =>
        !entry.directory &&
        /\.(?:jpe?g|png|gif|webp|avif)$/i.test(entry.filename) &&
        !entry.filename.split("/").some((part) => part.startsWith(".") || part === "__MACOSX"),
    )
    .map((entry) => ({ path: entry.filename, type: "", double: false }))
    .sort((a, b) => naturalPathCompare(a.path, b.path));
  if (!pages.length) throw new ViewerError("invalid-file", "No comic pages.");
  if (pages.length > COMIC_LIMITS.pages)
    throw new ViewerError("resource-limit", "Comic page count exceeded.");
  let rtl = false;
  if (zip.entries.has("ComicInfo.xml")) {
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(
      await zip.read("ComicInfo.xml", 256 * 1024, signal),
    );
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw new ViewerError("invalid-file", "Invalid ComicInfo XML.");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (
      doc.documentElement.localName !== "ComicInfo" ||
      doc.querySelector("parsererror") ||
      doc.querySelectorAll("*").length > 10_000
    )
      throw new ViewerError("invalid-file", "Invalid ComicInfo XML.");
    rtl = doc.querySelector("Manga")?.textContent?.trim() === "YesAndRightToLeft";
    const seen = new Set<number>();
    for (const node of Array.from(doc.querySelectorAll("Pages > Page"))) {
      const value = node.getAttribute("Image") ?? "";
      const index = Number(value);
      if (!/^\d+$/.test(value) || index >= pages.length || seen.has(index))
        throw new ViewerError("invalid-file", "Invalid ComicInfo page index.");
      seen.add(index);
      pages[index].type = node.getAttribute("Type") ?? "";
      pages[index].double = node.getAttribute("DoublePage")?.toLowerCase() === "true";
    }
  }
  if (!pages.some((page) => page.type === "FrontCover")) pages[0].type = "FrontCover";
  return { pages, rtl };
}
export function comicSpreads(pages: ComicPage[]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < pages.length; ) {
    if (
      pages[i].double ||
      pages[i].type === "FrontCover" ||
      i + 1 === pages.length ||
      pages[i + 1].double ||
      pages[i + 1].type === "FrontCover"
    )
      result.push([i++]);
    else {
      result.push([i, i + 1]);
      i += 2;
    }
  }
  return result;
}
