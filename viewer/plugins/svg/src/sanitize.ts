export interface SanitizedSvg {
  readonly source: string;
  readonly removedItems: number;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const BLOCKED_ELEMENTS = new Set([
  "script", "foreignobject", "iframe", "object", "embed", "audio", "video",
  "style", "animate", "animatemotion", "animatetransform", "set", "discard",
]);
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif);/i;
const URL_REFERENCE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

function decodeXml(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = bytes.subarray(2).slice();
    for (let index = 0; index + 1 < swapped.length; index += 2) {
      [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    }
    return new TextDecoder("utf-16le", { fatal: true }).decode(swapped);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function safeReference(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("#") || SAFE_DATA_IMAGE.test(trimmed);
}

function containsUnsafeUrl(value: string) {
  URL_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_REFERENCE.exec(value))) {
    if (!safeReference(match[2])) return true;
  }
  return false;
}

export function looksLikeSvg(bytes: Uint8Array) {
  try {
    const source = decodeXml(bytes).replace(/^\uFEFF?\s*/, "");
    if (/<!doctype/i.test(source)) return false;
    const withoutPreamble = source
      .replace(/^<\?xml[\s\S]*?\?>\s*/i, "")
      .replace(/^(?:<!--[\s\S]*?-->\s*)+/, "");
    return /^<(?:[A-Za-z_][\w.-]*:)?svg(?:\s|>)/.test(withoutPreamble);
  } catch {
    return false;
  }
}

export function sanitizeSvg(bytes: Uint8Array): SanitizedSvg | undefined {
  let source: string;
  try {
    source = decodeXml(bytes);
  } catch {
    return undefined;
  }
  if (/<!doctype/i.test(source)) return undefined;

  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (
    root.localName.toLowerCase() !== "svg"
    || root.namespaceURI !== SVG_NAMESPACE
    || document.getElementsByTagName("parsererror").length > 0
  ) return undefined;

  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  if (elements.length > 100_000) return undefined;
  let removedItems = 0;
  for (const element of elements) {
    if (element !== root && BLOCKED_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove();
      removedItems += 1;
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value;
      const unsafe = name.startsWith("on")
        || name === "style"
        || name === "base"
        || ((name === "href" || name === "src") && !safeReference(value))
        || containsUnsafeUrl(value);
      if (unsafe) {
        element.removeAttributeNode(attribute);
        removedItems += 1;
      }
    }
  }

  return { source: new XMLSerializer().serializeToString(document), removedItems };
}
