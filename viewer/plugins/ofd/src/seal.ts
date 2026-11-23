export type SealPicture =
  | { readonly kind: "image"; readonly type: string; readonly bytes: Uint8Array }
  /** Seal appearance stored as a nested OFD package (common on e-invoices). */
  | { readonly kind: "ofd"; readonly bytes: Uint8Array };

const MAX_DEPTH = 24;
const MAX_NODES = 20_000;

export function sniffImage(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d && bytes.length > 26) return "image/bmp";
  return undefined;
}

function classify(bytes: Uint8Array): SealPicture | undefined {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return { kind: "ofd", bytes };
  const type = sniffImage(bytes);
  return type ? { kind: "image", type, bytes } : undefined;
}

/**
 * Finds the stamp picture inside a GB/T 38540 / GM/T 0031 signature value or seal file.
 * Rather than modelling every SES version, the DER tree is walked and the first OCTET STRING
 * holding an image or a nested OFD wins; OCTET STRINGs that wrap DER are searched too.
 */
export function extractSealPicture(data: Uint8Array): SealPicture | undefined {
  const direct = classify(data);
  if (direct) return direct;
  let nodes = 0;
  const walk = (start: number, end: number, depth: number): SealPicture | undefined => {
    let p = start;
    while (p + 2 <= end) {
      if (++nodes > MAX_NODES) return undefined;
      const tag = data[p]!;
      if ((tag & 0x1f) === 0x1f) return undefined; // high-tag-number form is not used by SES
      let length = data[p + 1]!;
      p += 2;
      if (length & 0x80) {
        const size = length & 0x7f;
        if (size === 0 || size > 4 || p + size > end) return undefined; // indefinite or oversized
        length = 0;
        for (let i = 0; i < size; i += 1) length = length * 256 + data[p + i]!;
        p += size;
      }
      if (p + length > end) return undefined;
      if (tag & 0x20) {
        if (depth < MAX_DEPTH) {
          const found = walk(p, p + length, depth + 1);
          if (found) return found;
        }
      } else if (tag === 0x04 && length > 4) {
        const found = classify(data.subarray(p, p + length)) ?? (depth < MAX_DEPTH ? walk(p, p + length, depth + 1) : undefined);
        if (found) return found;
      }
      p += length;
    }
    return undefined;
  };
  return walk(0, data.length, 0);
}
