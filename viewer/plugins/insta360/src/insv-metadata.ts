import { readBlob } from "./read-blob";

const MAGIC = "8db42d694ccc418790edff439fe026bf";
const TRAILER_BYTES = 78;
const MAX_OFFSETS_BYTES = 4 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;

export interface InsvMetadata {
  readonly device: "X4" | "X5" | "X6";
  readonly offsetV3?: readonly number[];
  readonly cropWidth?: number;
  readonly cropHeight?: number;
  readonly preview?: InsvEmbeddedPreview;
}

export interface InsvEmbeddedPreview {
  readonly offset: number;
  readonly size: number;
  readonly width: 1280;
  readonly height: 640;
}

function u32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return new TextDecoder("latin1").decode(bytes.subarray(offset, offset + length));
}

function readVarint(bytes: Uint8Array, start: number) {
  let value = 0;
  let shift = 0;
  let offset = start;
  while (offset < bytes.length && shift <= 49) {
    const byte = bytes[offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
  }
  return undefined;
}

function protobufFields(bytes: Uint8Array) {
  const fields = new Map<number, Uint8Array | number>();
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    if (!key) return undefined;
    offset = key.offset;
    const field = Math.floor(key.value / 8);
    const wire = key.value & 7;
    if (wire === 0) {
      const value = readVarint(bytes, offset);
      if (!value) return undefined;
      fields.set(field, value.value);
      offset = value.offset;
    } else if (wire === 1) {
      if (offset + 8 > bytes.length) return undefined;
      offset += 8;
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      if (!length || length.value > bytes.length - length.offset) return undefined;
      offset = length.offset;
      fields.set(field, bytes.subarray(offset, offset + length.value));
      offset += length.value;
    } else if (wire === 5) {
      if (offset + 4 > bytes.length) return undefined;
      offset += 4;
    } else return undefined;
  }
  return fields;
}

function nestedInteger(fields: Map<number, Uint8Array | number> | undefined, field: number) {
  const value = fields?.get(field);
  return typeof value === "number" ? value : undefined;
}

export async function inspectInsvMetadata(file: File, signal: AbortSignal): Promise<InsvMetadata | undefined> {
  if (file.size < TRAILER_BYTES) return undefined;
  const trailer = await readBlob(file.slice(file.size - TRAILER_BYTES), signal);
  if (trailer[1] !== 0 || ascii(trailer, TRAILER_BYTES - MAGIC.length, MAGIC.length) !== MAGIC) return undefined;
  const offsetsSize = u32(trailer, 2);
  const extraSize = u32(trailer, 38);
  if (offsetsSize === 0 || offsetsSize > MAX_OFFSETS_BYTES || extraSize > file.size) return undefined;
  const offsetsStart = file.size - TRAILER_BYTES - offsetsSize;
  if (offsetsStart < file.size - extraSize) return undefined;
  const offsets = await readBlob(file.slice(offsetsStart, offsetsStart + offsetsSize), signal);
  let metadataSize: number | undefined;
  let metadataOffset: number | undefined;
  let previewSize: number | undefined;
  let previewOffset: number | undefined;
  for (let offset = 0; offset + 10 <= offsets.length; offset += 10) {
    const id = offsets[offset];
    const format = offsets[offset + 1];
    if (id === 1 && format === 1) {
      metadataSize = u32(offsets, offset + 2);
      metadataOffset = u32(offsets, offset + 6);
    } else if (id === 2 && format === 0) {
      previewSize = u32(offsets, offset + 2);
      previewOffset = u32(offsets, offset + 6);
    }
  }
  if (!metadataSize || metadataSize > MAX_METADATA_BYTES || metadataOffset === undefined
    || metadataOffset + metadataSize > extraSize) return undefined;
  const start = file.size - extraSize + metadataOffset;
  const fields = protobufFields(await readBlob(file.slice(start, start + metadataSize), signal));
  const model = fields?.get(2);
  if (!(model instanceof Uint8Array)) return undefined;
  const cameraType = ascii(model, 0, model.length);
  const device = cameraType === "Insta360 X4" ? "X4"
    : cameraType === "Insta360 X5" ? "X5"
      : cameraType === "Insta360 X6" ? "X6" : undefined;
  if (!device) return undefined;
  const offsetBytes = fields?.get(54);
  const offsetV3 = offsetBytes instanceof Uint8Array
    ? ascii(offsetBytes, 0, offsetBytes.length).split("_").map(Number)
    : undefined;
  const cropBytes = fields?.get(27);
  const crop = cropBytes instanceof Uint8Array ? protobufFields(cropBytes) : undefined;
  const previewStart = previewOffset === undefined ? undefined : file.size - extraSize + previewOffset;
  return {
    device,
    offsetV3: offsetV3?.length === 40 && offsetV3.every(Number.isFinite) ? offsetV3 : undefined,
    cropWidth: nestedInteger(crop, 3),
    cropHeight: nestedInteger(crop, 4),
    preview: previewStart !== undefined && previewSize === 1_228_840
      && previewOffset! + previewSize <= extraSize
      ? { offset: previewStart, size: previewSize, width: 1280, height: 640 }
      : undefined,
  };
}

export const INSV_METADATA_PROBE_BUDGET = TRAILER_BYTES + MAX_OFFSETS_BYTES + MAX_METADATA_BYTES;
