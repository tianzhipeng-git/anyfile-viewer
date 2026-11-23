import { splitParagraphs, type IworkApp, type IworkModel, type IworkSection } from "./model";

/** iWork '09 XML (`index.xml` for Pages, `index.apxl` for Keynote). */
const SF = "http://developer.apple.com/namespaces/sf";
const KEY = "http://developer.apple.com/namespaces/keynote2";

export class LegacyFormatError extends Error {}

/** Namespace-aware descendant lookup; avoids `getElementsByTagNameNS` gaps in lightweight DOMs. */
function descendants(scope: Element | Document, namespace: string, localName: string) {
  return Array.from(scope.getElementsByTagName("*")).filter(
    (element) => element.namespaceURI === namespace && element.localName === localName,
  );
}

/** iWork always writes the `sf:` prefix; qualified-name lookup works in every XML DOM. */
function sfAttribute(element: Element | undefined, name: string) {
  return element?.getAttribute(`sf:${name}`) ?? undefined;
}

function paragraphText(paragraph: Element) {
  let text = "";
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) text += child.nodeValue ?? "";
      else if (child.nodeType === 1) {
        const element = child as Element;
        if (element.namespaceURI === SF && element.localName === "ghost-text") continue;
        if (element.namespaceURI === SF && (element.localName === "br" || element.localName === "lnbr")) text += "\n";
        else if (element.namespaceURI === SF && element.localName === "tab") text += "\t";
        else walk(element);
      }
    }
  };
  walk(paragraph);
  return text;
}

function paragraphsIn(scope: Element, exclude?: (element: Element) => boolean) {
  return descendants(scope, SF, "p")
    .filter((paragraph) => !exclude?.(paragraph))
    .flatMap((paragraph) => splitParagraphs(paragraphText(paragraph)));
}

function insideNotes(element: Element, slide: Element) {
  for (let node = element.parentElement; node && node !== slide; node = node.parentElement) {
    if (node.namespaceURI === KEY && node.localName === "notes") return true;
  }
  return false;
}

function parse(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new LegacyFormatError("Malformed iWork XML.");
  return document;
}

function buildPages(document: Document): IworkModel {
  if (document.documentElement.localName !== "document") throw new LegacyFormatError("Not a Pages document.");
  // Section prototypes also carry body storages; the document's own body is a root child.
  const storage = Array.from(document.documentElement.children).find(
    (child) => child.namespaceURI === SF && child.localName === "text-storage" && sfAttribute(child, "kind") === "body",
  );
  const body = storage && descendants(storage, SF, "text-body")[0];
  const paragraphs = body ? paragraphsIn(body) : [];
  const sections: IworkSection[] = paragraphs.length ? [{ role: "body", paragraphs, notes: [] }] : [];
  return { app: "pages", generation: "xml", sections };
}

function buildKeynote(document: Document): IworkModel {
  if (document.documentElement.namespaceURI !== KEY || document.documentElement.localName !== "presentation") {
    throw new LegacyFormatError("Not a Keynote presentation.");
  }
  const list = descendants(document, KEY, "slide-list")[0];
  const slides = list ? descendants(list, KEY, "slide") : [];
  const sections = slides.map((slide): IworkSection => {
    const thumbnails = descendants(slide, KEY, "thumbnails")[0];
    const path = sfAttribute(thumbnails && descendants(thumbnails, SF, "data")[0], "path");
    const notes = descendants(slide, KEY, "notes")[0];
    return {
      role: "slide",
      paragraphs: paragraphsIn(slide, (paragraph) => insideNotes(paragraph, slide)),
      notes: notes ? paragraphsIn(notes) : [],
      image: path || undefined,
    };
  });
  return { app: "keynote", generation: "xml", sections };
}

export function buildLegacyModel(app: IworkApp, xml: string): IworkModel {
  const document = parse(xml);
  return app === "pages" ? buildPages(document) : buildKeynote(document);
}
