export function isSkp(bytes: Uint8Array) {
  return bytes.length >= 32 && bytes[0] === 0xff && bytes[1] === 0xfe
    && bytes[2] === 0xff && bytes[3] === 0x0e
    && new TextDecoder("utf-16le").decode(bytes.subarray(4, 32)) === "SketchUp Model";
}
