export interface Insta360DngInspection {
  readonly kind: "raw";
  readonly width: 2976;
  readonly height: 5952;
  readonly make: "Arashi Vision";
  readonly model: "Insta360 X3";
}

const MAX_TEXT_BYTES = 256;

export interface TiffDirectoryLocation {
  readonly offset: number;
  readonly littleEndian: boolean;
}

function readAscii(bytes: Uint8Array, start: number, length: number) {
  if (start < 0 || start + length > bytes.length) return undefined;
  let result = "";
  for (let offset = start; offset < start + length && bytes[offset] !== 0; offset += 1) {
    result += String.fromCharCode(bytes[offset]);
  }
  return result.trim();
}

export function locateTiffDirectory(bytes: Uint8Array): TiffDirectoryLocation | undefined {
  if (bytes.length < 8) return undefined;
  const order = String.fromCharCode(bytes[0], bytes[1]);
  const littleEndian = order === "II";
  if (!littleEndian && order !== "MM") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(2, littleEndian) !== 42) return undefined;
  return { offset: view.getUint32(4, littleEndian), littleEndian };
}

export function inspectInsta360DngDirectory(
  bytes: Uint8Array,
  directory: number,
  baseOffset: number,
  littleEndian: boolean,
): Insta360DngInspection | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = (offset: number, length: number) => {
    const result = offset - baseOffset;
    return result >= 0 && result + length <= bytes.length ? result : undefined;
  };
  const u16 = (offset: number) => {
    const position = local(offset, 2);
    return position === undefined ? undefined : view.getUint16(position, littleEndian);
  };
  const u32 = (offset: number) => {
    const position = local(offset, 4);
    return position === undefined ? undefined : view.getUint32(position, littleEndian);
  };
  const count = u16(directory);
  if (count === undefined || count > 512 || local(directory, 2 + count * 12) === undefined) return undefined;

  let width: number | undefined;
  let height: number | undefined;
  let make: string | undefined;
  let model: string | undefined;
  let dng = false;
  for (let index = 0; index < count; index += 1) {
    const entry = directory + 2 + index * 12;
    const tag = u16(entry);
    const type = u16(entry + 2);
    const values = u32(entry + 4);
    if (tag === undefined || type === undefined || values === undefined) return undefined;
    if ((tag === 0x0100 || tag === 0x0101) && values === 1 && (type === 3 || type === 4)) {
      const value = type === 3 ? u16(entry + 8) : u32(entry + 8);
      if (tag === 0x0100) width = value;
      else height = value;
    } else if ((tag === 0x010f || tag === 0x0110) && type === 2 && values > 0 && values <= MAX_TEXT_BYTES) {
      const valueOffset = values <= 4 ? entry + 8 : u32(entry + 8);
      if (valueOffset === undefined) return undefined;
      const valuePosition = local(valueOffset, values);
      if (valuePosition === undefined) return undefined;
      const value = readAscii(bytes, valuePosition, values);
      if (value === undefined) return undefined;
      if (tag === 0x010f) make = value;
      else model = value;
    } else if (tag === 0xc612 && type === 1 && values === 4) {
      dng = true;
    }
  }

  return dng && width === 2976 && height === 5952 && make === "Arashi Vision" && model === "Insta360 X3"
    ? { kind: "raw", width, height, make, model }
    : undefined;
}

export function inspectInsta360Dng(bytes: Uint8Array): Insta360DngInspection | undefined {
  const location = locateTiffDirectory(bytes);
  return location
    ? inspectInsta360DngDirectory(bytes, location.offset, 0, location.littleEndian)
    : undefined;
}
