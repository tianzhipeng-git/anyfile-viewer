function bytes(...parts: readonly (number | Uint8Array)[]) {
  const flat: number[] = [];
  for (const part of parts) {
    if (typeof part === "number") flat.push(part);
    else flat.push(...part);
  }
  return Uint8Array.from(flat);
}

export function uleb(value: number) {
  const result: number[] = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value) byte |= 0x80;
    result.push(byte);
  } while (value);
  return Uint8Array.from(result);
}

function name(value: string) {
  const encoded = new TextEncoder().encode(value);
  return bytes(uleb(encoded.length), encoded);
}

function section(id: number, payload: Uint8Array) {
  return bytes(id, uleb(payload.length), payload);
}

export function wasmFixture() {
  const type = section(1, bytes(1, 0x60, 0, 0));
  const imports = section(2, bytes(1, name("env"), name("log"), 0, 0));
  const functions = section(3, bytes(1, 0));
  const memory = section(5, bytes(1, 0, 1));
  const exports = section(7, bytes(2, name("run"), 0, 1, name("memory"), 2, 0));
  const start = section(8, bytes(1));
  const custom = section(0, bytes(name("name"), 0));
  const code = section(10, bytes(1, 2, 0, 0x0b));
  return bytes(Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0), type, imports, functions, memory, exports, start, custom, code);
}
