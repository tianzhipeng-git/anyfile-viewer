import type { ProbeViewerContext } from "@anyfile/viewer-protocol";

import { ProbeReader, fourCC } from "./probe-io";

export interface AsfInfo {
  video: { codec: "wmv2"; width: number; height: number } | null;
  audio: { codec: "wmav1" | "wmav2"; channels: number; sampleRate: number } | null;
}

// ASF object GUIDs as stored on disk (little-endian first three fields).
const HEADER = "3026b2758e66cf11a6d900aa0062ce6c";
const DATA = "3626b2758e66cf11a6d900aa0062ce6c";
const STREAM = "9107dcb7b7a9cf118ee600c00c205365";
const VIDEO_STREAM = "c0ef19bc4d5bcf11a8fd00805f5c442b";
const AUDIO_STREAM = "409e69f84d5bcf11a8fd00805f5c442b";
const AUDIO_CODECS: Record<number, "wmav1" | "wmav2"> = { 0x160: "wmav1", 0x161: "wmav2" };
const MAX_HEADER = 64 * 1024;

function guid(view: DataView, offset: number) {
  let value = "";
  for (let index = 0; index < 16; index++) value += view.getUint8(offset + index).toString(16).padStart(2, "0");
  return value;
}

/** ASF video type data is a BITMAPINFOHEADER; FFmpeg muxers prefix 11 bytes (width, height, 2, size). */
function bitmapOffset(view: DataView, start: number, length: number) {
  for (const offset of [0, 11]) {
    const size = view.getUint32(start + offset, true);
    if (offset + 20 > length || size < 40 || size > length - offset) continue;
    if (view.getUint16(start + offset + 12, true) === 1) return offset;
  }
  return -1;
}

export async function inspectAsf({ file, signal }: ProbeViewerContext): Promise<AsfInfo | null> {
  try {
    const reader = new ProbeReader(file, signal);
    const head = await reader.read(0, 30);
    if (guid(head, 0) !== HEADER || head.getUint16(28, true) !== 0x0201) return null;
    const headerSize = head.getUint32(16, true), objects = head.getUint32(24, true);
    if (head.getUint32(20, true) || headerSize < 54 || headerSize > Math.min(file.size, MAX_HEADER) || !objects || objects > 64) return null;
    const body = await reader.read(30, headerSize - 30);
    let video: AsfInfo["video"] = null, audio: AsfInfo["audio"] = null, wrapped = false;
    for (let offset = 0, count = 0; offset < headerSize - 30; count++) {
      if (count >= objects || offset + 24 > headerSize - 30) return null;
      const size = body.getUint32(offset + 16, true);
      if (body.getUint32(offset + 20, true) || size < 24 || offset + size > headerSize - 30) return null;
      if (guid(body, offset) === STREAM) {
        const type = guid(body, offset + 24), specific = body.getUint32(offset + 64, true);
        const correction = body.getUint32(offset + 68, true), flags = body.getUint16(offset + 72, true);
        const start = offset + 78;
        if (size < 78 || flags & 0x8000 || start + specific + correction !== offset + size) return null;
        if (type === VIDEO_STREAM) {
          const bitmap = bitmapOffset(body, start, specific);
          if (video || bitmap < 0) return null;
          const width = body.getInt32(start + bitmap + 4, true), height = body.getInt32(start + bitmap + 8, true);
          const codec = fourCC(body, start + bitmap + 16).toUpperCase();
          if (codec !== "WMV2" || width <= 0 || height <= 0 || width * height > 1920 * 1080) return null;
          video = { codec: "wmv2", width, height };
        } else if (type === AUDIO_STREAM) {
          if (audio || specific < 18) return null;
          const codec = AUDIO_CODECS[body.getUint16(start, true)], channels = body.getUint16(start + 2, true), sampleRate = body.getUint32(start + 4, true);
          if (!codec || ![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 96000) return null;
          audio = { codec, channels, sampleRate };
        }
        wrapped = true;
      }
      offset += size;
    }
    const data = await reader.read(headerSize, 24), dataSize = data.getUint32(16, true);
    if (!wrapped || guid(data, 0) !== DATA || data.getUint32(20, true) || dataSize < 24 || headerSize + dataSize > file.size) return null;
    return video || audio ? { video, audio } : null;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return null;
  }
}
