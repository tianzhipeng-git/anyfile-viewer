import type { IworkApp } from "./model";

/** How an iWork package is laid out inside the ZIP container. */
export type IworkLayout =
  /** Single-file iWork 2013+ document: `Index/*.iwa` next to `Data/` and previews. */
  | { readonly kind: "iwa"; readonly prefix: string }
  /** Zipped package bundle: `<name>/Index.zip` holds the IWA streams. */
  | { readonly kind: "iwa-zip"; readonly prefix: string }
  /** iWork '09 XML document, optionally gzip-compressed. */
  | { readonly kind: "xml"; readonly prefix: string; readonly index: string }
  /** Password-protected IWA document (`.iwpv2` verifier present). */
  | { readonly kind: "encrypted" };

const PREVIEWS = ["preview.jpg", "QuickLook/Thumbnail.jpg", "preview-web.jpg", "QuickLook/Thumbnail.png"];

export function iworkAppFromName(name: string): IworkApp | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pages")) return "pages";
  if (lower.endsWith(".key")) return "keynote";
  return undefined;
}

/** Accepts the package root or one wrapping bundle directory (e.g. `Talk.key/`). */
function prefixOf(name: string, marker: string) {
  if (!name.endsWith(marker)) return undefined;
  const prefix = name.slice(0, name.length - marker.length);
  return prefix === "" || /^[^/]+\/$/.test(prefix) ? prefix : undefined;
}

export function detectIworkLayout(names: Iterable<string>, app: IworkApp): IworkLayout | undefined {
  const legacyIndex = app === "pages" ? "index.xml" : "index.apxl";
  let found: IworkLayout | undefined;
  for (const name of names) {
    if (name.endsWith(".iwpv2")) return { kind: "encrypted" };
    if (found) continue;
    let prefix = prefixOf(name, "Index/Document.iwa");
    if (prefix !== undefined) found = { kind: "iwa", prefix };
    else if ((prefix = prefixOf(name, "Index.zip")) !== undefined) found = { kind: "iwa-zip", prefix };
    else if ((prefix = prefixOf(name, legacyIndex)) !== undefined) found = { kind: "xml", prefix, index: name };
    else if ((prefix = prefixOf(name, `${legacyIndex}.gz`)) !== undefined) found = { kind: "xml", prefix, index: name };
  }
  return found;
}

export function previewPath(names: ReadonlySet<string>, prefix: string) {
  return PREVIEWS.map((name) => prefix + name).find((name) => names.has(name));
}
