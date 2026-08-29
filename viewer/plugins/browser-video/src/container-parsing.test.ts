import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { inspectVideoFile } from "./inspect";
import { probeBrowserVideo } from "./probe";

const encoder = new TextEncoder();

function concatenate(...chunks: readonly Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function isoBox(type: string, payload = new Uint8Array()) {
  const result = new Uint8Array(8 + payload.length);
  new DataView(result.buffer).setUint32(0, result.length);
  result.set(encoder.encode(type), 4);
  result.set(payload, 8);
  return result;
}

function isoTrack(handlerType: string) {
  const handler = new Uint8Array(12);
  handler.set(encoder.encode(handlerType), 8);
  return isoBox("trak", isoBox("mdia", isoBox("hdlr", handler)));
}

function mp4WithAppendedTrack(track: Uint8Array) {
  const source = new Uint8Array(readFileSync(join(process.cwd(), "examples", "mp4-avc-aac-faststart.mp4")));
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  let moovStart = -1;
  let moovSize = 0;
  for (let offset = 0; offset + 8 <= source.length;) {
    const size = view.getUint32(offset);
    const type = new TextDecoder().decode(source.subarray(offset + 4, offset + 8));
    if (type === "moov") {
      moovStart = offset;
      moovSize = size;
      break;
    }
    if (size < 8) break;
    offset += size;
  }
  if (moovStart < 0 || moovSize < 8) throw new Error("fixture has no ordinary moov box");

  const moovEnd = moovStart + moovSize;
  const result = concatenate(source.subarray(0, moovEnd), track, source.subarray(moovEnd));
  new DataView(result.buffer).setUint32(moovStart, moovSize + track.length);
  return new File([result], "auxiliary-track.mp4");
}

function largeTailMoovMp4() {
  const source = new Uint8Array(readFileSync(join(process.cwd(), "examples", "mp4-avc-aac-tail-moov.mp4")));
  const sourceView = new DataView(source.buffer, source.byteOffset, source.byteLength);
  let mdatStart = -1;
  let mdatSize = 0;
  let moovStart = -1;
  for (let offset = 0; offset + 8 <= source.length;) {
    const size = sourceView.getUint32(offset);
    const type = new TextDecoder().decode(source.subarray(offset + 4, offset + 8));
    if (type === "mdat") {
      mdatStart = offset;
      mdatSize = size;
    }
    if (type === "moov") {
      moovStart = offset;
      break;
    }
    if (size < 8) break;
    offset += size;
  }
  if (mdatStart < 0 || mdatSize < 8 || moovStart < 0) throw new Error("fixture lacks mdat/moov boxes");

  const padding = new Uint8Array(300 * 1024);
  const result = concatenate(source.subarray(0, moovStart), padding, source.subarray(moovStart));
  new DataView(result.buffer).setUint32(mdatStart, mdatSize + padding.length);
  return new File([result], "large-tail-moov.mp4");
}

function ebmlElement(id: readonly number[], payload: Uint8Array) {
  if (payload.length > 126) throw new Error("test EBML payload is too large");
  return concatenate(new Uint8Array(id), new Uint8Array([0x80 | payload.length]), payload);
}

function webmTrack(type: number, codecId?: string) {
  const fields = [ebmlElement([0x83], new Uint8Array([type]))];
  if (codecId) fields.push(ebmlElement([0x86], encoder.encode(codecId)));
  return ebmlElement([0xae], concatenate(...fields));
}

function syntheticWebm(...tracks: readonly Uint8Array[]) {
  const header = ebmlElement([0x1a, 0x45, 0xdf, 0xa3], ebmlElement([0x42, 0x82], encoder.encode("webm")));
  const segment = new Uint8Array([0x18, 0x53, 0x80, 0x67, 0xff]);
  const trackList = ebmlElement([0x16, 0x54, 0xae, 0x6b], concatenate(...tracks));
  return new File([concatenate(header, segment, trackList)], "auxiliary-track.webm");
}

function context(file: File) {
  return { file, signal: new AbortController().signal };
}

describe("browser video auxiliary tracks", () => {
  it("ignores unclassified and metadata ISO BMFF tracks without sample tables", async () => {
    const file = mp4WithAppendedTrack(concatenate(isoBox("trak"), isoTrack("meta")));
    const inspection = await inspectVideoFile(context(file));

    expect(inspection).toMatchObject({ codecsSupported: true });
    expect(inspection?.videoTracks).toHaveLength(1);
    expect(inspection?.audioTracks).toHaveLength(1);
    expect(await probeBrowserVideo(context(file))).toBe(3);
  });

  it("does not hide a malformed ISO BMFF video track", async () => {
    const file = mp4WithAppendedTrack(isoTrack("vide"));
    const inspection = await inspectVideoFile(context(file));

    expect(inspection).toMatchObject({ codecsSupported: false });
    expect(inspection?.videoTracks).toHaveLength(1);
    expect(await probeBrowserVideo(context(file))).toBe(0);
  });

  it("ignores a WebM subtitle track without a media codec", async () => {
    const file = syntheticWebm(webmTrack(1, "V_VP9"), webmTrack(17));
    const inspection = await inspectVideoFile(context(file));

    expect(inspection).toMatchObject({ codecsSupported: true });
    expect(inspection?.videoTracks).toHaveLength(1);
    expect(inspection?.audioTracks).toHaveLength(0);
    expect(await probeBrowserVideo(context(file))).toBe(3);
  });

  it("does not hide a WebM audio track with a missing CodecID", async () => {
    const file = syntheticWebm(webmTrack(1, "V_VP9"), webmTrack(2));
    const inspection = await inspectVideoFile(context(file));

    expect(inspection).toMatchObject({ codecsSupported: false });
    expect(await probeBrowserVideo(context(file))).toBe(0);
  });

  it("finds a tail moov without allocating a string for each scanned byte", async () => {
    const fromCharCode = vi.spyOn(String, "fromCharCode");

    expect(await probeBrowserVideo(context(largeTailMoovMp4()))).toBe(3);
    expect(fromCharCode.mock.calls.length).toBeLessThan(500);
  });
});
