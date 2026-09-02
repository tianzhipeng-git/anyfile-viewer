const encoder = new TextEncoder();

function concatenate(...chunks: readonly Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function jpegSegment(marker: number, payload: Uint8Array) {
  const result = new Uint8Array(payload.length + 4);
  result.set([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  result.set(payload, 4);
  return result;
}

export function djiOsmoPhotoBytes(model = "OQ001") {
  const make = encoder.encode("Osmo\0");
  const modelBytes = encoder.encode(`${model}\0`);
  const ifdBytes = 2 + 2 * 12 + 4;
  const tiff = new Uint8Array(8 + ifdBytes + make.length + modelBytes.length);
  const view = new DataView(tiff.buffer);
  tiff.set(encoder.encode("II"), 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);
  const writeAscii = (offset: number, tag: number, value: Uint8Array, valueOffset: number) => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, 2, true);
    view.setUint32(offset + 4, value.length, true);
    view.setUint32(offset + 8, valueOffset, true);
    tiff.set(value, valueOffset);
  };
  const values = 8 + ifdBytes;
  writeAscii(10, 0x010f, make, values);
  writeAscii(22, 0x0110, modelBytes, values + make.length);
  const sof = new Uint8Array([8, 0x1e, 0x50, 0x3c, 0xa0, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]);
  const xmp = encoder.encode('http://ns.adobe.com/xap/1.0/\0<rdf:Description GPano:ProjectionType="equirectangular" GPano:UsePanoramaViewer="True">');
  return concatenate(new Uint8Array([0xff, 0xd8]), jpegSegment(0xe1, concatenate(encoder.encode("Exif\0\0"), tiff)), jpegSegment(0xe1, xmp), jpegSegment(0xc0, sof), new Uint8Array([0xff, 0xda]));
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

function track(handlerType: "vide" | "soun", sampleEntry: Uint8Array, name: string) {
  const handler = new Uint8Array(12 + name.length);
  handler.set(encoder.encode(handlerType), 8);
  handler.set(encoder.encode(name), 12);
  const stsd = fullBox("stsd", concatenate(new Uint8Array([0, 0, 0, 1]), sampleEntry));
  return box("trak", box("mdia", concatenate(box("hdlr", handler), box("minf", box("stbl", stsd)))));
}

function videoEntry(format: "hvc1" | "jpeg", width: number, height: number) {
  const prefix = new Uint8Array(78);
  const view = new DataView(prefix.buffer);
  view.setUint16(24, width);
  view.setUint16(26, height);
  return box(format, format === "hvc1" ? concatenate(prefix, box("hvcC")) : prefix);
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

export function djiOsmoVideoBytes(options: { signature?: boolean; videoTracks?: number; width?: number } = {}) {
  const ftyp = box("ftyp", concatenate(encoder.encode("isom"), new Uint8Array(4), encoder.encode("isomiso2mp41")));
  const signature = box("free", options.signature === false ? encoder.encode("ordinary camera") : encoder.encode("dvtm_oq101.proto\0Osmo 360"));
  const videos = Array.from({ length: options.videoTracks ?? 2 }, () => track("vide", videoEntry("hvc1", options.width ?? 3840, 3840), "VideoHandler"));
  const moov = box("moov", concatenate(...videos, track("soun", audioEntry(), "SoundHandler"), track("vide", videoEntry("jpeg", 688, 344), "Thumbnail"), box("free", encoder.encode("djmd dbgi"))));
  return concatenate(ftyp, signature, extendedMdat(96 * 1024), moov);
}
