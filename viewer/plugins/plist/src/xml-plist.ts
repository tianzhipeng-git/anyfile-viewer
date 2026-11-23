import { PLIST_LIMITS, PlistError, type PlistValue } from "./types";

/**
 * Decoder for Apple's XML property list (the `<plist>` document form).
 *
 * A small hand-written tokenizer walks the XML instead of relying on the
 * browser DOM parser, so the same code runs in Node tests and in the viewer,
 * handles DOCTYPE/entity declarations, and enforces nesting/size budgets.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

type Frame =
  | { kind: "dict"; entries: { key: string; value: PlistValue }[]; pendingKey?: string }
  | { kind: "array"; items: PlistValue[] };

const VALUE_TAGS = new Set(["string", "integer", "real", "date", "data", "true", "false"]);

export function decodeXmlPlist(xml: string): PlistValue {
  if (xml.length > PLIST_LIMITS.maxDataBytes * 4) throw new PlistError("resource-limit", "XML plist is too large.");
  if (!xml.includes("<plist")) throw new PlistError("invalid-file", "Not an XML property list.");

  const stack: Frame[] = [];
  let root: PlistValue | undefined;
  const text = xml;
  let i = 0;

  const assign = (value: PlistValue) => {
    const frame = stack[stack.length - 1];
    if (!frame) {
      if (root !== undefined) throw new PlistError("invalid-file", "XML plist has more than one root value.");
      root = value;
      return;
    }
    if (frame.kind === "array") {
      frame.items.push(value);
      if (frame.items.length > PLIST_LIMITS.maxNodes) throw new PlistError("resource-limit", "XML plist array is too large.");
    } else {
      if (frame.pendingKey === undefined) throw new PlistError("invalid-file", "XML plist dictionary value has no key.");
      frame.entries.push({ key: frame.pendingKey, value });
      frame.pendingKey = undefined;
    }
  };

  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) break;
    if (lt > i) {
      // Stray text only matters as string content, which is consumed per-tag below.
      i = lt;
    }

    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      if (end === -1) throw new PlistError("invalid-file", "Unterminated XML comment.");
      i = end + 3;
      continue;
    }
    if (text.startsWith("<?", lt) || text.startsWith("<!", lt)) {
      const end = text.indexOf(">", lt + 2);
      if (end === -1) throw new PlistError("invalid-file", "Unterminated XML declaration.");
      i = end + 1;
      continue;
    }

    const tagEnd = findTagEnd(text, lt + 1);
    const raw = text.slice(lt + 1, tagEnd);
    i = tagEnd + 1;
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim();
      if (name === "dict" || name === "array") {
        const frame = stack.pop();
        if (!frame) throw new PlistError("invalid-file", "XML plist has an unbalanced closing tag.");
        if (frame.kind === "dict") {
          if (frame.pendingKey !== undefined) throw new PlistError("invalid-file", "XML plist dictionary key has no value.");
          assign({ kind: "dict", entries: frame.entries });
        } else {
          assign({ kind: "array", items: frame.items });
        }
      }
      continue;
    }
    const selfClosing = raw.endsWith("/");
    const name = (selfClosing ? raw.slice(0, -1) : raw).trim().split(/\s+/)[0];

    if (name === "dict" || name === "array") {
      if (stack.length >= PLIST_LIMITS.maxDepth) throw new PlistError("resource-limit", "XML plist nesting is too deep.");
      const frame: Frame = name === "dict" ? { kind: "dict", entries: [] } : { kind: "array", items: [] };
      if (selfClosing) {
        assign(name === "dict" ? { kind: "dict", entries: [] } : { kind: "array", items: [] });
      } else {
        stack.push(frame);
      }
      continue;
    }

    if (name === "key") {
      const { content, next } = readElementText(text, i);
      i = next;
      const frame = stack[stack.length - 1];
      if (!frame || frame.kind !== "dict") throw new PlistError("invalid-file", "XML plist <key> is outside a dictionary.");
      frame.pendingKey = decodeEntities(content);
      continue;
    }

    if (name === "true" || name === "false") {
      if (!selfClosing) {
        const { next } = readElementText(text, i);
        i = next;
      }
      assign({ kind: "boolean", value: name === "true" });
      continue;
    }

    if (VALUE_TAGS.has(name)) {
      const { content, next } = readElementText(text, i);
      i = next;
      assign(decodeScalar(name, decodeEntities(content)));
      continue;
    }
    // Ignore unknown structural elements (e.g. <plist>).
  }

  if (root === undefined) throw new PlistError("invalid-file", "XML plist has no value.");
  return root;
}

function findTagEnd(text: string, from: number): number {
  // Tags do not contain raw '<'; a '>' inside an attribute value is not expected here.
  const end = text.indexOf(">", from);
  if (end === -1) throw new PlistError("invalid-file", "Unterminated XML tag.");
  return end;
}

function readElementText(text: string, from: number): { content: string; next: number } {
  const close = text.indexOf("</", from);
  if (close === -1) throw new PlistError("invalid-file", "Unterminated XML element.");
  const content = text.slice(from, close);
  const gt = text.indexOf(">", close);
  if (gt === -1) throw new PlistError("invalid-file", "Unterminated XML closing tag.");
  return { content, next: gt + 1 };
}

function decodeScalar(tag: string, content: string): PlistValue {
  const trimmed = content.trim();
  switch (tag) {
    case "string":
      return { kind: "string", value: content };
    case "integer": {
      if (!/^[+-]?\d+$/.test(trimmed)) throw new PlistError("invalid-file", "XML plist integer is malformed.");
      return { kind: "integer", value: BigInt(trimmed) };
    }
    case "real": {
      const value = Number(trimmed);
      if (!Number.isFinite(value)) throw new PlistError("invalid-file", "XML plist real is malformed.");
      return { kind: "real", value };
    }
    case "date": {
      const value = new Date(trimmed);
      if (Number.isNaN(value.getTime())) throw new PlistError("invalid-file", "XML plist date is malformed.");
      return { kind: "date", value };
    }
    case "data": {
      const base64 = trimmed.replace(/\s+/g, "");
      const binary = atobLenient(base64);
      if (binary.length > PLIST_LIMITS.maxDataBytes) throw new PlistError("resource-limit", "XML plist data is too large.");
      return { kind: "data", value: binary };
    }
    default:
      throw new PlistError("invalid-file", `Unsupported XML plist tag <${tag}>.`);
  }
}

function atobLenient(base64: string): Uint8Array {
  if (base64.length === 0) return new Uint8Array(0);
  let normalized = base64;
  const globalAtob = (globalThis as { atob?: (input: string) => string }).atob;
  if (globalAtob) {
    try {
      const decoded = globalAtob(normalized);
      const out = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i += 1) out[i] = decoded.charCodeAt(i);
      return out;
    } catch {
      // Fall through to manual decoding for imperfect input.
    }
  }
  normalized = normalized.replace(/[^A-Za-z0-9+/]/g, "");
  const length = Math.floor((normalized.length * 3) / 4);
  const out = new Uint8Array(length);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of normalized) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, index);
}
