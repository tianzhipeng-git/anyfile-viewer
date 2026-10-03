export function isPart10(bytes: Uint8Array) {
  return bytes.length >= 132 && bytes[128] === 68 && bytes[129] === 73 && bytes[130] === 67 && bytes[131] === 77;
}

