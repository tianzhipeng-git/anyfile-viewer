import { readBookZipCatalog } from "@anyfile/archive-metadata-viewer/zip-catalog";
import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const FIXED_PAGE = /\.fpage(\/\[\d+\](\.last)?\.piece)?$/i;

/** True when the ZIP index looks like an XPS/OpenXPS package with at least one FixedPage. */
export function isXpsCatalog(names: Iterable<string>) {
  let contentTypes = false;
  let page = false;
  for (const name of names) {
    if (name.toLowerCase() === "[content_types].xml" || name.toLowerCase().startsWith("[content_types].xml/")) contentTypes = true;
    if (FIXED_PAGE.test(name)) page = true;
  }
  return contentTypes && page;
}

/** Reads only the ZIP central directory; page XML is validated by `open()`. */
export async function probeXps({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  try {
    const { names } = await readBookZipCatalog(file, signal);
    return isXpsCatalog(names) ? 4 : 0;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return 0;
  }
}
