import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
import { ProbeReader } from "@anyfile/ffmpeg-playback/probe-io";

export interface PsInfo {
  width: number;
  height: number;
  audioCodec: "ac3" | "mp2" | null;
  channels: number;
  sampleRate: number;
}

interface AudioInfo { audioCodec: "ac3" | "mp2"; channels: number; sampleRate: number }

const WINDOW = 128 * 1024;
const SCAN = 4096;
const MPEG_RATES = [44100, 48000, 32000];
const AC3_RATES = [48000, 44100, 32000];
const HEADER_CODES = new Set([0xbb, 0xbc, 0xbe, 0xbf]);

/** MPEG-1 Layer II frame header. */
function mpegAudio(bytes: Uint8Array, start: number, end: number): AudioInfo | null {
  for (let offset = start; offset + 4 <= end && offset < start + SCAN; offset++) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xfe) !== 0xfc) continue;
    const rate = (bytes[offset + 2] >> 2) & 3;
    if (bytes[offset + 2] >> 4 === 0x0f || rate === 3) continue;
    return { audioCodec: "mp2", channels: (bytes[offset + 3] >> 6) === 3 ? 1 : 2, sampleRate: MPEG_RATES[rate] };
  }
  return null;
}

/** AC-3 sync frame header; subtitle substreams in private stream 1 are ignored. */
function ac3Audio(bytes: Uint8Array, start: number, end: number): AudioInfo | null {
  for (let offset = start; offset + 8 <= end && offset < start + SCAN; offset++) {
    if (bytes[offset] !== 0x0b || bytes[offset + 1] !== 0x77) continue;
    const fscod = bytes[offset + 4] >> 6, acmod = bytes[offset + 6] >> 5;
    if (fscod === 3 || (bytes[offset + 4] & 0x3f) > 37 || bytes[offset + 5] >> 3 > 10 || acmod > 2) continue;
    return { audioCodec: "ac3", channels: acmod === 1 ? 1 : 2, sampleRate: AC3_RATES[fscod] };
  }
  return null;
}

/** MPEG-2 sequence header together with its sequence extension; MPEG-1 video is not claimed. */
function mpegVideo(bytes: Uint8Array, start: number, end: number) {
  const limit = Math.min(end, start + SCAN);
  for (let offset = start; offset + 8 <= limit; offset++) {
    if (bytes[offset] || bytes[offset + 1] || bytes[offset + 2] !== 1 || bytes[offset + 3] !== 0xb3) continue;
    const width = (bytes[offset + 4] << 4) | (bytes[offset + 5] >> 4);
    const height = ((bytes[offset + 5] & 0x0f) << 8) | bytes[offset + 6];
    if (!width || !height || width * height > 1920 * 1080) return null;
    for (let next = offset + 8; next + 5 <= limit && next < offset + 0x104; next++) {
      if (bytes[next] || bytes[next + 1] || bytes[next + 2] !== 1) continue;
      if (bytes[next + 3] === 0xb5 && (bytes[next + 4] & 0xf0) === 0x10) return { width, height };
      if (bytes[next + 3] === 0x00) break;
    }
    return null;
  }
  return null;
}

export async function inspectMpegPs({ file, signal }: ProbeViewerContext): Promise<PsInfo | null> {
  try {
    const length = Math.min(file.size, WINDOW);
    if (length < 64) return null;
    const view = await new ProbeReader(file, signal).read(0, length);
    const bytes = new Uint8Array(view.buffer, view.byteOffset, length);
    const start = (offset: number) => offset + 4 <= length && !bytes[offset] && !bytes[offset + 1] && bytes[offset + 2] === 1;
    if (!start(0) || bytes[3] !== 0xba) return null;
    let video: { width: number; height: number } | null = null, audio: AudioInfo | null = null;
    let videoId = -1, audioId = -1;
    for (let offset = 0, packets = 0; offset + 4 <= length; packets++) {
      if (packets >= 256 || !start(offset)) return null;
      const id = bytes[offset + 3];
      if (id === 0xb9) break;
      if (id === 0xba) {
        // MPEG-2 pack headers carry a '01' prefix; MPEG-1 pack headers are followed by 0xFF stuffing.
        if ((bytes[offset + 4] & 0xc0) === 0x40) offset += 14;
        else if ((bytes[offset + 4] & 0xf0) === 0x20) { offset += 12; while (offset < length && bytes[offset] === 0xff) offset++; }
        else return null;
        continue;
      }
      const size = view.getUint16(offset + 4);
      if (HEADER_CODES.has(id)) { if (offset + 6 + size > length) return null; offset += 6 + size; continue; }
      if (!size) return null;
      const payload = offset + 6, end = Math.min(payload + size, length);
      if (id >= 0xe0 && id <= 0xef) {
        if (videoId >= 0 && videoId !== id) return null;
        videoId = id;
        video ??= mpegVideo(bytes, payload, end);
      } else if (id >= 0xc0 && id <= 0xdf) {
        if (audioId >= 0 && audioId !== id) return null;
        audioId = id;
        audio ??= mpegAudio(bytes, payload, end);
      } else if (id === 0xbd) {
        const ac3 = ac3Audio(bytes, payload, end);
        if (ac3) {
          if (audioId >= 0 && audioId !== id) return null;
          audioId = id;
          audio ??= ac3;
        }
      } else return null;
      if (payload + size > length) break;
      offset = payload + size;
    }
    return video ? { ...video, audioCodec: audio?.audioCodec ?? null, channels: audio?.channels ?? 0, sampleRate: audio?.sampleRate ?? 0 } : null;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return null;
  }
}
