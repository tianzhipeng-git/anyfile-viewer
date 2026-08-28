export type RawFormat = "DNG" | "CR2" | "CR3" | "CRW" | "NEF" | "ARW" | "RAF" | "RWL" | "RAW" | "RW2";
export interface RawInspection { readonly format: RawFormat; readonly make?: string; readonly model?: string; readonly hasPreview: boolean }

const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
const u32be = (bytes: Uint8Array, offset: number) => (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;

function extension(fileName: string) { return fileName.slice(fileName.lastIndexOf(".")).toLowerCase(); }

function inspectTiff(bytes: Uint8Array, acceptedMagic = 42) {
  if (bytes.length < 16) return undefined;
  const little = ascii(bytes, 0, 2) === "II";
  if (!little && ascii(bytes, 0, 2) !== "MM") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read16 = (offset: number) => view.getUint16(offset, little);
  const read32 = (offset: number) => view.getUint32(offset, little);
  if (read16(2) !== acceptedMagic) return undefined;
  const directory = read32(4);
  if (directory + 2 > bytes.length) return undefined;
  const count = read16(directory);
  let make: string | undefined; let model: string | undefined; let dng = false; let previewOffset = 0; let previewLength = 0;
  for (let index = 0; index < count; index += 1) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > bytes.length) return undefined;
    const tag = read16(entry); const type = read16(entry + 2); const values = read32(entry + 4); const valueOffset = values <= 4 ? entry + 8 : read32(entry + 8);
    if ((tag === 271 || tag === 272) && type === 2 && values > 0 && valueOffset + values <= bytes.length) {
      const value = ascii(bytes, valueOffset, values).replace(/\0.*$/, "").trim();
      if (tag === 271) make = value; else model = value;
    } else if (tag === 50706) dng = true;
    else if (tag === 513 && type === 4 && values === 1) previewOffset = read32(entry + 8);
    else if (tag === 514 && type === 4 && values === 1) previewLength = read32(entry + 8);
  }
  return { make, model, dng, hasPreview: previewOffset > 0 && previewLength > 0 };
}

export function inspectRawHeader(bytes: Uint8Array, fileName: string): RawInspection | undefined {
  const ext = extension(fileName);
  if (ext === ".crw") {
    if (bytes.length < 14 || ascii(bytes, 0, 2) !== "II" || ascii(bytes, 6, 8) !== "HEAPCCDR") return undefined;
    return { format: "CRW", make: "Canon", hasPreview: true };
  }
  if (ext === ".raf") {
    if (bytes.length < 92 || ascii(bytes, 0, 16) !== "FUJIFILMCCD-RAW ") return undefined;
    return { format: "RAF", make: "FUJIFILM", hasPreview: u32be(bytes, 84) > 0 && u32be(bytes, 88) > 0 };
  }
  if (ext === ".cr3") {
    if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return undefined;
    const length = u32be(bytes, 0); if (length < 16 || length > bytes.length) return undefined;
    const brands = [ascii(bytes, 8, 4)]; for (let offset = 16; offset + 4 <= length; offset += 4) brands.push(ascii(bytes, offset, 4));
    return brands.includes("crx ") ? { format: "CR3", make: "Canon", hasPreview: true } : undefined;
  }
  if (ext === ".rwl" || ext === ".raw" || ext === ".rw2") {
    const panasonic = inspectTiff(bytes, 85);
    if (!panasonic) return undefined;
    const format = ext === ".rwl" ? "RWL" : ext === ".rw2" ? "RW2" : "RAW";
    return { format, ...panasonic };
  }
  const tiff = inspectTiff(bytes); if (!tiff) return undefined;
  if (ext === ".cr2") {
    if (bytes.length < 12 || ascii(bytes, 8, 2) !== "CR" || bytes[10] !== 2) return undefined;
    return { format: "CR2", ...tiff };
  }
  if (ext === ".dng") return tiff.dng ? { format: "DNG", ...tiff } : undefined;
  if (ext === ".nef") return { format: "NEF", ...tiff };
  if (ext === ".arw") return { format: "ARW", ...tiff };
  return undefined;
}

const VERIFIED_RAW_MODELS = new Set<string>([
  // Add only models backed by committed, redistributable real-camera fixtures.
]);

export function isVerifiedRawModel(inspection: RawInspection) {
  if (!inspection.make || !inspection.model) return false;
  return VERIFIED_RAW_MODELS.has(`${inspection.make.trim().toLowerCase()}\0${inspection.model.trim().toLowerCase()}`);
}
