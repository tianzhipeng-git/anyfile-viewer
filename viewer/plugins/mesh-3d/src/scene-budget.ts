import { Unzlib } from "fflate";
import { fbxVersion, isDae } from "./scene-header";
const scalarLimit = 12_000_000;
export function checkSceneInput(bytes: ArrayBuffer, format: "fbx" | "dae") {
  if (bytes.byteLength > 128 * 1024 * 1024) throw new RangeError("Scene input budget");
  const data = new Uint8Array(bytes);
  const header = new TextDecoder().decode(data.subarray(0, 65536));
  if (format === "fbx" && header.startsWith("Kaydara FBX Binary")) {
    if (fbxVersion(data.subarray(0, 32)) < 6400) throw new Error("Unsupported binary FBX");
    checkBinary(data); return;
  }
  const source = new TextDecoder().decode(data);
  if (format === "fbx" ? fbxVersion(data.subarray(0, 65536)) < 7000 : !isDae(header)) throw new Error("Invalid scene header");
  if (format === "dae" && /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Unsupported XML declarations");
  let scalars = 0, declarations = 0;
  for (const match of source.matchAll(format === "fbx" ? /\*(\d+)\s*\{/g : /<(?:float_array|int_array|Name_array)\b[^>]*\bcount\s*=\s*["'](\d+)["']/g)) {
    declarations += Number(match[1]); if (declarations > scalarLimit) throw new RangeError("Scene array budget");
  }
  // Count actual tokens too; declared array lengths need not be honest.
  const numbers = /[-+]?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?/g;
  while (numbers.exec(source)) if (++scalars > scalarLimit) throw new RangeError("Scene scalar budget");
  let nodes = 0;
  const tags = format === "fbx" ? /\{/g : /<\w/g;
  while (tags.exec(source)) if (++nodes > 100_000) throw new RangeError("Scene node budget");
}
function checkBinary(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const wide = view.getUint32(23, true) >= 7500, headerSize = wide ? 25 : 13;
  const integer = (offset: number) => wide ? Number(view.getBigUint64(offset, true)) : view.getUint32(offset, true);
  let nodes = 0, scalars = 0, expanded = 0;
  const node = (offset: number, parentEnd: number, depth: number): number => {
    if (++nodes > 100_000 || depth > 64) throw new RangeError("FBX hierarchy budget");
    if (offset + headerSize > parentEnd) throw new Error("Truncated FBX node");
    const end = integer(offset), count = integer(offset + (wide ? 8 : 4)), length = integer(offset + (wide ? 16 : 8));
    if (!end) return offset + headerSize;
    if (![end, count, length].every(Number.isSafeInteger) || end > parentEnd || end <= offset + headerSize) throw new Error("Invalid FBX node range");
    let cursor = offset + headerSize + bytes[offset + headerSize - 1];
    const propertiesEnd = cursor + length;
    if (propertiesEnd > end) throw new Error("Invalid FBX property range");
    scalars += count;
    if (scalars > scalarLimit) throw new RangeError("FBX property budget");
    for (let i = 0; i < count; i++) {
      if (cursor >= propertiesEnd) throw new Error("Truncated FBX property");
      const type = String.fromCharCode(bytes[cursor++]);
      const fixed: Record<string, number> = { Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 };
      if (fixed[type]) cursor += fixed[type];
      else if (type === "S" || type === "R") { if (cursor + 4 > propertiesEnd) throw new Error("Truncated FBX string"); const size = view.getUint32(cursor, true); cursor += 4 + size; }
      else if ("bcdfil".includes(type)) {
        if (cursor + 12 > propertiesEnd) throw new Error("Truncated FBX array");
        const count = view.getUint32(cursor, true), encoding = view.getUint32(cursor + 4, true), length = view.getUint32(cursor + 8, true);
        const size = count * ({ b: 1, c: 1, d: 8, f: 4, i: 4, l: 8 }[type]!);
        scalars += count; expanded += size;
        if (scalars > scalarLimit || expanded > 128 * 1024 * 1024) throw new RangeError("FBX decoded array budget");
        cursor += 12;
        if (cursor + length > propertiesEnd || encoding > 1 || (!encoding && length !== size)) throw new Error("Invalid FBX array");
        if (encoding) {
          let decoded = 0;
          const inflate = new Unzlib(chunk => { decoded += chunk.length; if (decoded > size) throw new RangeError("FBX compressed array overflow"); });
          for (let start = 0; start < length; start += 1024) inflate.push(bytes.subarray(cursor + start, cursor + Math.min(start + 1024, length)), start + 1024 >= length);
          if (decoded !== size) throw new Error("Invalid FBX decoded array length");
        }
        cursor += length;
      } else throw new Error("Unknown FBX property");
      if (cursor > propertiesEnd) throw new Error("Truncated FBX property");
    }
    if (cursor !== propertiesEnd) throw new Error("Invalid FBX property length");
    while (cursor < end) cursor = node(cursor, end, depth + 1);
    if (cursor !== end) throw new Error("Invalid FBX children");
    return end;
  };
  let offset = 27;
  while (offset + headerSize <= bytes.length && integer(offset)) offset = node(offset, bytes.length, 0);
}
