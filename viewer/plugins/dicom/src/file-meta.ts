import { ViewerError } from "@anyfile/viewer-protocol";

// File meta information is always Explicit VR Little Endian, even for compressed data sets.
// Stop before interpreting the first data-set element or compressed byte stream.
export function readFileMeta(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 132;
  let syntax = "", sopClass = "";
  while (offset + 8 <= bytes.length && view.getUint16(offset, true) === 2) {
    const tag = view.getUint16(offset + 2, true);
    const vr = String.fromCharCode(bytes[offset + 4], bytes[offset + 5]);
    const long = ["OB", "OD", "OF", "OL", "OV", "OW", "SQ", "UC", "UR", "UT", "UN"].includes(vr);
    const size = long ? 12 : 8;
    if (offset + size > bytes.length) throw new ViewerError("invalid-file", "Invalid file meta information.");
    const length = long ? view.getUint32(offset + 8, true) : view.getUint16(offset + 6, true);
    if (offset + size + length > bytes.length) throw new ViewerError("resource-limit", "File meta information exceeds header budget.");
    if (tag === 0x10 || tag === 2) {
      if (vr !== "UI" || length > 64) throw new ViewerError("invalid-file", "Invalid file meta UID.");
      const value = new TextDecoder().decode(bytes.subarray(offset + size, offset + size + length)).replace(/[\0 ]+$/, "");
      if (tag === 0x10) syntax = value;
      else sopClass = value;
    }
    offset += size + length;
  }
  return { syntax, sopClass };
}
