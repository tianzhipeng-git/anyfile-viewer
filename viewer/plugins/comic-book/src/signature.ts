export function comicArchiveKind(bytes: Uint8Array) {
  if (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21 && bytes[4] === 0x1a && bytes[5] === 7) {
    if (bytes[6] === 0) return 4;
    if (bytes[6] === 1 && bytes[7] === 0) return 5;
  }
  if ([0x37,0x7a,0xbc,0xaf,0x27,0x1c].every((byte,i) => bytes[i] === byte)) return 7;
  return 0;
}
