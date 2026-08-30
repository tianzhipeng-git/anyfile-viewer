import { zipSync } from "fflate";

export function concatenate(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function npyFixture(options: {
  readonly descr: string;
  readonly shape: readonly number[];
  readonly data: Uint8Array;
  readonly fortran?: boolean;
  readonly version?: 1 | 2 | 3;
}): Uint8Array {
  const version = options.version ?? 1;
  const magic = Uint8Array.of(0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, version, 0);
  const preambleLength = version === 1 ? 10 : 12;
  const tuple = options.shape.length === 1 ? `${options.shape[0]},` : options.shape.join(", ");
  const dictionary = `{'descr': ${options.descr}, 'fortran_order': ${options.fortran ? "True" : "False"}, 'shape': (${tuple}), }`;
  const encoder = new TextEncoder();
  const raw = encoder.encode(dictionary);
  const padding = (64 - ((preambleLength + raw.length + 1) % 64)) % 64;
  const header = encoder.encode(`${dictionary}${" ".repeat(padding)}\n`);
  const length = new Uint8Array(version === 1 ? 2 : 4);
  const view = new DataView(length.buffer);
  if (version === 1) view.setUint16(0, header.length, true);
  else view.setUint32(0, header.length, true);
  return concatenate(magic, length, header, options.data);
}

export function int32Data(values: readonly number[], little = true): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setInt32(index * 4, value, little));
  return bytes;
}

export function npzFixture(files: Readonly<Record<string, Uint8Array>>, level: 0 | 6 = 6): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [bytes, { level }]])));
}
