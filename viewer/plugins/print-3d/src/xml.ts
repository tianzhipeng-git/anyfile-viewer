export function parseXml(source: string) {
  if (source.length > 32 * 1024 * 1024) throw new RangeError();
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("XML entities forbidden");
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Invalid XML");
  let count = 0;
  const walk = (node: Element, depth: number) => { if (++count > 1_000_000 || depth > 64) throw new RangeError(); for (const child of node.children) walk(child, depth + 1); };
  walk(document.documentElement, 0); return document.documentElement;
}
export function children(node: Element, name: string) { return [...node.children].filter(child => child.localName === name); }
export function child(node: Element, name: string) { const result = children(node, name)[0]; if (!result) throw new Error("Missing XML element"); return result; }
export function number(value: string | null) { if (value === null || !value.trim()) throw new Error("Missing number"); const result = Number(value); if (!Number.isFinite(result)) throw new Error("Invalid number"); return result; }
