import { DOMParser as LinkedomDOMParser } from "linkedom";

export type XmlMimeType = "application/xml" | "image/svg+xml" | "text/html";

/**
 * Node/Worker XML/HTML/SVG parser backed by linkedom.
 * Falls back to native DOMParser if present (e.g. happy-dom test environments).
 */
export function parseXmlDocument(
  source: string,
  mimeType: XmlMimeType = "application/xml",
): Document {
  if (typeof globalThis.DOMParser === "function") {
    return new globalThis.DOMParser().parseFromString(source, mimeType);
  }
  const linkedomMime = mimeType === "application/xml" ? "text/xml" : mimeType;
  return new LinkedomDOMParser().parseFromString(source, linkedomMime) as unknown as Document;
}
