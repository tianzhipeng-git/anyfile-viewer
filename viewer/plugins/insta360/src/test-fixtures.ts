const encoder = new TextEncoder();

export function concatenate(...chunks: readonly Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function jpegSegment(marker: number, payload: Uint8Array) {
  const result = new Uint8Array(payload.length + 4);
  result.set([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  result.set(payload, 4);
  return result;
}

export function x3PhotoBytes(model = "Insta360 X3") {
  const makeBytes = encoder.encode("Arashi Vision\0");
  const modelBytes = encoder.encode(`${model}\0`);
  const ifdBytes = 2 + 2 * 12 + 4;
  const tiff = new Uint8Array(8 + ifdBytes + makeBytes.length + modelBytes.length);
  const view = new DataView(tiff.buffer);
  tiff.set(encoder.encode("II"), 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);
  const writeAsciiEntry = (offset: number, tag: number, value: Uint8Array, valueOffset: number) => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, 2, true);
    view.setUint32(offset + 4, value.length, true);
    view.setUint32(offset + 8, valueOffset, true);
    tiff.set(value, valueOffset);
  };
  const values = 8 + ifdBytes;
  writeAsciiEntry(10, 0x010f, makeBytes, values);
  writeAsciiEntry(22, 0x0110, modelBytes, values + makeBytes.length);
  const exif = concatenate(encoder.encode("Exif\0\0"), tiff);
  const sof = new Uint8Array([8, 0x0b, 0xa0, 0x17, 0x40, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]);
  return concatenate(new Uint8Array([0xff, 0xd8]), jpegSegment(0xe1, exif), jpegSegment(0xc0, sof), new Uint8Array([0xff, 0xda]));
}

function box(type: string, payload = new Uint8Array()) {
  const result = new Uint8Array(8 + payload.length);
  new DataView(result.buffer).setUint32(0, result.length);
  result.set(encoder.encode(type), 4);
  result.set(payload, 8);
  return result;
}

function fullBox(type: string, payload: Uint8Array) {
  return box(type, concatenate(new Uint8Array(4), payload));
}

function track(handlerType: "vide" | "soun", sampleEntry: Uint8Array) {
  const handler = new Uint8Array(12);
  handler.set(encoder.encode(handlerType), 8);
  const stsd = fullBox("stsd", concatenate(new Uint8Array([0, 0, 0, 1]), sampleEntry));
  return box("trak", box("mdia", concatenate(box("hdlr", handler), box("minf", box("stbl", stsd)))));
}

function videoEntry(width = 1024, height = 512) {
  const prefix = new Uint8Array(78);
  const view = new DataView(prefix.buffer);
  view.setUint16(24, width);
  view.setUint16(26, height);
  return box("avc1", concatenate(prefix, box("avcC", new Uint8Array([1, 100, 0, 40]))));
}

function audioEntry() {
  const prefix = new Uint8Array(28);
  const view = new DataView(prefix.buffer);
  view.setUint16(16, 2);
  view.setUint16(24, 48000);
  return box("mp4a", concatenate(prefix, fullBox("esds", new Uint8Array([0x05, 0x01, 0x10]))));
}

function extendedMdat(payloadBytes: number) {
  const result = new Uint8Array(16 + payloadBytes);
  const view = new DataView(result.buffer);
  view.setUint32(0, 1);
  result.set(encoder.encode("mdat"), 4);
  view.setBigUint64(8, BigInt(result.length));
  return result;
}

export function x3LrvBytes(options: { padding?: number; width?: number; height?: number } = {}) {
  const ftyp = box("ftyp", concatenate(encoder.encode("avc1"), new Uint8Array(4), encoder.encode("avc1isom")));
  const mdat = extendedMdat(options.padding ?? 96 * 1024);
  const moov = box("moov", concatenate(track("vide", videoEntry(options.width, options.height)), track("soun", audioEntry())));
  return { bytes: concatenate(ftyp, mdat, moov, box("free")), moovOffset: ftyp.length + mdat.length, moovBytes: moov.length };
}

export function x3InsvBytes(options: { padding?: number; width?: number } = {}) {
  return x3LrvBytes({ padding: options.padding, width: options.width ?? 2880, height: 2880 });
}
