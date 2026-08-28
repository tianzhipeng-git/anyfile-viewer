export type ModernFormat = "JXL" | "HEIC";

const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
const u32be = (bytes: Uint8Array, offset: number) => (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
const JXL_CONTAINER_SIGNATURE = [0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10];
const HEVC_BRANDS = new Set(["heic", "heix", "hevc", "hevx"]);

export function inspectModernHeader(bytes: Uint8Array): ModernFormat | undefined {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0x0a) return "JXL";
  if (bytes.length >= JXL_CONTAINER_SIGNATURE.length && JXL_CONTAINER_SIGNATURE.every((value, index) => bytes[index] === value)) return "JXL";
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return undefined;
  const boxLength = u32be(bytes, 0);
  if (boxLength < 16 || boxLength > bytes.length) return undefined;
  const brands = [ascii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= boxLength; offset += 4) brands.push(ascii(bytes, offset, 4));
  if (brands.includes("avif") || brands.includes("avis")) return undefined;
  return brands.some((brand) => HEVC_BRANDS.has(brand)) ? "HEIC" : undefined;
}
