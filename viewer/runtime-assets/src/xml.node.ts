import { Window } from "happy-dom";

export type XmlMimeType = "application/xml" | "image/svg+xml" | "text/html";

let parser: DOMParser | undefined;

/**
 * Node XML/HTML/SVG parser. happy-dom is the same DOM every plugin test already runs against,
 * so namespaces, `parsererror` documents, `.children` and selectors match what the Web path sees.
 * Uses the global `DOMParser` when one exists (e.g. a happy-dom test environment).
 */
export function parseXmlDocument(
  source: string,
  mimeType: XmlMimeType = "application/xml",
): Document {
  if (typeof globalThis.DOMParser === "function") {
    return new globalThis.DOMParser().parseFromString(source, mimeType);
  }
  parser ??= new new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
    },
  }).DOMParser() as unknown as DOMParser;
  return parser.parseFromString(source, mimeType);
}
