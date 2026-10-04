import { ViewerError } from "@anyfile/viewer-protocol";
import type { Copy } from "./messages";

// libvisio/librevenge emits physical page dimensions in inches.
export function pageSize(svg: string, copy: Copy) {
  if (svg.length > 16 * 1024 * 1024) throw new ViewerError("resource-limit", copy.limit);
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg" || root.namespaceURI !== "http://www.w3.org/2000/svg" || document.querySelector("parsererror")) throw new ViewerError("invalid-file", copy.invalid);
  const dimension = (name: string) => {
    const value = root.getAttribute(name) ?? "";
    if (!/^\d+(?:\.\d+)?in$/.test(value)) throw new ViewerError("invalid-file", copy.invalid);
    return Number.parseFloat(value) * 96;
  };
  const width = dimension("width"), height = dimension("height");
  if (!width || !height) throw new ViewerError("invalid-file", copy.invalid);
  if (width > 32768 || height > 32768 || width * height > 100_000_000) throw new ViewerError("resource-limit", copy.limit);
  return { width, height };
}
