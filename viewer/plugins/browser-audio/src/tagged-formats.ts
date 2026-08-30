import { inspectFlacStreamInfo, inspectMp3Frames, MAX_FLAC_METADATA_BLOCKS } from "./basic-formats";
import { readAudioProbeRange } from "./read-blob";
import type { AudioFileInspection } from "./types";

const MP3_FRAME_PROBE_BYTES = 4 * 1024;

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function synchsafeSize(bytes: Uint8Array) {
  if (bytes.length < 10 || bytes.subarray(6, 10).some((value) => value & 0x80)) return undefined;
  return bytes.subarray(6, 10).reduce((total, value) => total * 128 + value, 0);
}

export async function inspectMp3File(file: File, signal: AbortSignal): Promise<AudioFileInspection | undefined> {
  const header = await readAudioProbeRange(file, signal, 0, 10);
  let audioOffset = 0;
  if (ascii(header, 0, 3) === "ID3") {
    const tagSize = synchsafeSize(header);
    if (tagSize === undefined) return undefined;
    const footerSize = header[3] === 4 && (header[5] & 0x10) ? 10 : 0;
    audioOffset = 10 + tagSize + footerSize;
    if (!Number.isSafeInteger(audioOffset) || audioOffset >= file.size) return undefined;
  }
  const frames = await readAudioProbeRange(file, signal, audioOffset, MP3_FRAME_PROBE_BYTES);
  return inspectMp3Frames(frames);
}

export async function inspectFlacFile(file: File, signal: AbortSignal): Promise<AudioFileInspection | undefined> {
  const signature = await readAudioProbeRange(file, signal, 0, 4);
  if (ascii(signature, 0, 4) !== "fLaC") return undefined;
  let offset = 4;
  let streamInfo: Uint8Array | undefined;
  let last = false;
  for (let count = 0; count < MAX_FLAC_METADATA_BLOCKS && !last; count += 1) {
    const header = await readAudioProbeRange(file, signal, offset, 4);
    if (header.length !== 4) return undefined;
    last = Boolean(header[0] & 0x80);
    const type = header[0] & 0x7f;
    const size = (header[1] << 16) | (header[2] << 8) | header[3];
    const bodyOffset = offset + 4;
    const nextOffset = bodyOffset + size;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > file.size) return undefined;
    if (type === 0) {
      if (streamInfo || size !== 34) return undefined;
      streamInfo = await readAudioProbeRange(file, signal, bodyOffset, size);
    }
    offset = nextOffset;
  }
  if (!last || offset >= file.size || !streamInfo) return undefined;
  return inspectFlacStreamInfo(streamInfo);
}
