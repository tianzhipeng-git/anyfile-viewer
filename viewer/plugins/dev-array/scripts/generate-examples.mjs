import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { zipSync } from "fflate";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examples = join(pluginRoot, "examples");

function concatenate(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function npy(descr, shape, data) {
  const dictionary = `{'descr': '${descr}', 'fortran_order': False, 'shape': (${shape.join(", ")}${shape.length === 1 ? "," : ""}), }`;
  const preamble = 10;
  const padding = (64 - ((preamble + dictionary.length + 1) % 64)) % 64;
  const header = new TextEncoder().encode(`${dictionary}${" ".repeat(padding)}\n`);
  const length = new Uint8Array(2);
  new DataView(length.buffer).setUint16(0, header.length, true);
  return concatenate(Uint8Array.of(0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0), length, header, data);
}

function int32(values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setInt32(index * 4, value, true));
  return bytes;
}

await mkdir(examples, { recursive: true });
const matrix = npy("<i4", [3, 4], int32(Array.from({ length: 12 }, (_, index) => index + 1)));
const vector = npy("<i4", [3], int32([10, 20, 30]));
const objects = npy("|O8", [1], new TextEncoder().encode("pickle payload is intentionally never loaded"));
await writeFile(join(examples, "matrix.npy"), matrix);
await writeFile(join(examples, "objects.npy"), objects);
await writeFile(join(examples, "arrays.npz"), zipSync({ "matrix.npy": matrix, "nested/vector.npy": vector }));
await writeFile(join(examples, "disguised.npy"), "not a numpy array\n");
await writeFile(join(examples, "disguised.npz"), "not a zip archive\n");
