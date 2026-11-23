import { FontFormatError } from "@anyfile/viewer-rendering/fixed-layout";

/** XPS §9.1.7.3: XOR the first 32 bytes with the GUID taken from the part name. */
export function deobfuscateFont(bytes: Uint8Array, partName: string): Uint8Array {
  const base = (partName.split("/").pop() ?? "").replace(/\.[^.]*$/, "");
  const hex = base.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex) || bytes.length < 32) throw new FontFormatError("Invalid obfuscated font name.");
  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) key[i] = Number.parseInt(hex.slice(30 - i * 2, 32 - i * 2), 16);
  const out = bytes.slice();
  for (let i = 0; i < 32; i += 1) out[i]! ^= key[i % 16]!;
  return out;
}
