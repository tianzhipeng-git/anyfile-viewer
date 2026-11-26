export type XmlMimeType = "application/xml" | "image/svg+xml" | "text/html";

/**
 * Browser XML/HTML/SVG parser backed by native DOMParser.
 */
export function parseXmlDocument(
  source: string,
  mimeType: XmlMimeType = "application/xml",
): Document {
  return new DOMParser().parseFromString(source, mimeType);
}
