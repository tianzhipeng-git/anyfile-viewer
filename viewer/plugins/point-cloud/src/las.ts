import { PointSampler } from "./sampler";
export function lasHeader(bytes: ArrayBuffer, fileSize: number, compressed = false) {
  if (bytes.byteLength < 227) throw new Error("Truncated LAS header");
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x4653414c || view.getUint8(24) !== 1 || view.getUint8(25) > 4) throw new Error("Unsupported LAS version");
  const minor = view.getUint8(25), headerSize = view.getUint16(94, true), offset = view.getUint32(96, true);
  const encodedFormat = view.getUint8(104);
  if (Boolean(encodedFormat & 128) !== compressed || (encodedFormat & 64)) throw new Error("Unsupported LAS compression");
  const format = encodedFormat & 63, length = view.getUint16(105, true);
  const minimum = [20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67][format];
  if (minimum === undefined || (format >= 6 && minor < 4) || length < minimum || offset < headerSize || headerSize < (minor === 4 ? 375 : minor === 3 ? 235 : 227)) throw new Error("Invalid LAS point layout");
  if (length > 4096) throw new RangeError("LAS point record budget");
  let count = view.getUint32(107, true);
  if (minor === 4) {
    if (bytes.byteLength < 375) throw new Error("Truncated LAS 1.4 header");
    const extended = view.getBigUint64(247, true);
    if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError();
    if (extended) count = Number(extended);
  }
  if (!count || !Number.isSafeInteger(count * length) || (compressed ? offset >= fileSize : offset + count * length > fileSize)) throw new Error("Truncated LAS points");
  const scales = [131, 139, 147].map(at => view.getFloat64(at, true));
  const offsets = [155, 163, 171].map(at => view.getFloat64(at, true));
  if (scales.some(n => !Number.isFinite(n) || n <= 0) || offsets.some(n => !Number.isFinite(n))) throw new Error("Invalid LAS coordinates");
  return { count, offset, length, format, scales, offsets };
}
export async function readLas(file: File, emit: (sampler: PointSampler, done: boolean) => void) {
  const header = lasHeader(await file.slice(0, 375).arrayBuffer(), file.size);
  const sampler = new PointSampler(); let lastSent = 0;
  for (let start = 0; start < header.count; start += 4096) {
    const count = Math.min(4096, header.count - start);
    const view = new DataView(await file.slice(header.offset + start * header.length, header.offset + (start + count) * header.length).arrayBuffer());
    for (let index = 0; index < count; index++) {
      const coordinates = header.scales.map((scale, axis) => view.getInt32(index * header.length + axis * 4, true) * scale + header.offsets[axis]);
      sampler.add(...coordinates as [number, number, number]);
    }
    if (start === 0 || sampler.count - lastSent >= 200_000) { emit(sampler, false); lastSent = sampler.count; }
  }
  emit(sampler, true);
}
