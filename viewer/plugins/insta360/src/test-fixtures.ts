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

export function x3DngBytes(options: { model?: string; width?: number; height?: number; dng?: boolean; directoryOffset?: number } = {}) {
  const makeBytes = encoder.encode("Arashi Vision\0");
  const modelBytes = encoder.encode(`${options.model ?? "Insta360 X3"}\0`);
  const entries = options.dng === false ? 4 : 5;
  const ifdBytes = 2 + entries * 12 + 4;
  const directory = options.directoryOffset ?? 8;
  const bytes = new Uint8Array(directory + ifdBytes + makeBytes.length + modelBytes.length);
  const view = new DataView(bytes.buffer);
  bytes.set(encoder.encode("II"), 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, directory, true);
  view.setUint16(directory, entries, true);
  const writeLong = (offset: number, tag: number, value: number) => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, 4, true);
    view.setUint32(offset + 4, 1, true);
    view.setUint32(offset + 8, value, true);
  };
  const writeAscii = (offset: number, tag: number, value: Uint8Array, valueOffset: number) => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, 2, true);
    view.setUint32(offset + 4, value.length, true);
    view.setUint32(offset + 8, valueOffset, true);
    bytes.set(value, valueOffset);
  };
  writeLong(directory + 2, 0x0100, options.width ?? 2976);
  writeLong(directory + 14, 0x0101, options.height ?? 5952);
  const values = directory + ifdBytes;
  writeAscii(directory + 26, 0x010f, makeBytes, values);
  writeAscii(directory + 38, 0x0110, modelBytes, values + makeBytes.length);
  if (options.dng !== false) {
    view.setUint16(directory + 50, 0xc612, true);
    view.setUint16(directory + 52, 1, true);
    view.setUint32(directory + 54, 4, true);
    bytes.set([1, 3, 0, 0], directory + 58);
  }
  return bytes;
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

function videoEntry(width = 1024, height = 512, codec: "avc1" | "hvc1" = "avc1") {
  const prefix = new Uint8Array(78);
  const view = new DataView(prefix.buffer);
  view.setUint16(24, width);
  view.setUint16(26, height);
  const config = codec === "avc1" ? box("avcC", new Uint8Array([1, 100, 0, 40])) : box("hvcC");
  return box(codec, concatenate(prefix, config));
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
  const dimension = options.width ?? 2880;
  return x3LrvBytes({ padding: options.padding, width: dimension, height: dimension });
}

function protobufVarint(value: number) {
  const bytes: number[] = [];
  do { bytes.push((value & 0x7f) | (value >= 0x80 ? 0x80 : 0)); value = Math.floor(value / 128); } while (value > 0);
  return new Uint8Array(bytes);
}

function protobufField(field: number, value: Uint8Array | number) {
  return typeof value === "number"
    ? concatenate(protobufVarint(field * 8), protobufVarint(value))
    : concatenate(protobufVarint(field * 8 + 2), protobufVarint(value.length), value);
}

const calibration = {
  X4: "2_1.948170_4618.370_4617.040_3996.930_3002.960_-0.616_0.341_89.501_0_0_0_0.37601721_1.41075909_-4.22507524_-0.00143595_0.00058836_16000_6000_71_1.948170_4606.880_4607.840_11994.350_3006.730_0.600_0.296_89.965_0.000769_0.000071_-0.032337_0.37986460_1.36779749_-4.10814619_-0.00046989_0.00116828_16000_6000_71_197632",
  X5: "2_2_4269.53_4269.67_2688.39_2703.29_0.402_-0.432_90.003_0_0_0_0.18702514_2.0107255_-3.01867962_-0.00028597_-0.00027196_10752_5376_113_2_4276.26_4277.82_8078.34_2692.77_-0.391_-0.355_89.578_-0.002706_-0.000147_-0.032249_0.19422133_1.97706831_-2.96845055_0.00193654_-0.00116275_10752_5376_113_197632",
} as const;

function insta360Trailer(model: "X4" | "X5" | "X6") {
  const crop = model === "X4" ? 5632 : 5312;
  const cropInfo = concatenate(protobufField(3, crop), protobufField(4, crop));
  const metadata = concatenate(
    protobufField(2, encoder.encode(`Insta360 ${model}`)),
    protobufField(27, cropInfo),
    ...(model === "X6" ? [] : [protobufField(54, encoder.encode(calibration[model]))]),
  );
  const metadataMarker = new Uint8Array(6);
  metadataMarker[0] = 1; metadataMarker[1] = 1;
  new DataView(metadataMarker.buffer).setUint32(2, metadata.length, true);
  const preview = new Uint8Array(1_228_840);
  const previewView = new DataView(preview.buffer);
  previewView.setUint32(0, 1, true);
  previewView.setUint32(4, 1_228_840, true);
  previewView.setUint32(8, 1, true);
  previewView.setUint32(16, 1280, true);
  previewView.setUint32(20, 640, true);
  const previewMarker = new Uint8Array(6);
  previewMarker[1] = 2;
  new DataView(previewMarker.buffer).setUint32(2, 1_228_840, true);
  const offsets = new Uint8Array(20);
  offsets[0] = 1; offsets[1] = 1;
  new DataView(offsets.buffer).setUint32(2, metadata.length, true);
  new DataView(offsets.buffer).setUint32(6, preview.length + previewMarker.length, true);
  offsets[10] = 2;
  new DataView(offsets.buffer).setUint32(12, 1_228_840, true);
  const offsetsMarker = new Uint8Array(6);
  new DataView(offsetsMarker.buffer).setUint32(2, offsets.length, true);
  const header = new Uint8Array(72);
  const extraSize = preview.length + previewMarker.length + metadata.length + metadataMarker.length
    + offsets.length + offsetsMarker.length + header.length;
  const headerView = new DataView(header.buffer);
  headerView.setUint32(32, extraSize, true);
  headerView.setUint32(36, 3, true);
  header.set(encoder.encode("8db42d694ccc418790edff439fe026bf"), 40);
  return concatenate(preview, previewMarker, metadata, metadataMarker, offsets, offsetsMarker, header);
}

export function modernInsvBytes(options: { padding?: number; width?: number; videoTracks?: number; model?: "X4" | "X5" | "X6" } = {}) {
  const ftyp = box("ftyp", concatenate(encoder.encode("avc1"), new Uint8Array(4), encoder.encode("avc1isom")));
  const mdat = extendedMdat(options.padding ?? 96 * 1024);
  const videoTracks = Array.from({ length: options.videoTracks ?? 2 }, () => track("vide", videoEntry(options.width ?? 3840, options.width ?? 3840, "hvc1")));
  const moov = box("moov", concatenate(...videoTracks, track("soun", audioEntry())));
  const metadata = insta360Trailer(options.model ?? "X5");
  return { bytes: concatenate(ftyp, mdat, moov, metadata), moovOffset: ftyp.length + mdat.length, moovBytes: moov.length };
}
