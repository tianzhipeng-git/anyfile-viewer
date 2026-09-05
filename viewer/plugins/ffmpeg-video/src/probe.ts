import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
import { ProbeReader, fourCC } from "@anyfile/ffmpeg-playback/probe-io";

export interface AviInfo { width: number; height: number; audio: boolean; channels: number; sampleRate: number }
const MPEG4 = new Set(["FMP4", "XVID", "DIVX", "DX50", "MP4V"]);
export async function inspectAvi({ file, signal }: ProbeViewerContext): Promise<AviInfo | null> {
  try {
    const reader = new ProbeReader(file, signal), header = await reader.read(0, 12);
    if (fourCC(header) !== "RIFF" || fourCC(header, 8) !== "AVI " || header.getUint32(4, true) + 8 !== file.size) return null;
    let main: DataView | undefined, video: DataView | undefined, audio: DataView | undefined;
    let streamCount = 0, movi = false, index = false;
    async function chunks(start: number, end: number, list: "root" | "hdrl" | "strl") {
      let stream: DataView | undefined, format: DataView | undefined;
      for (let offset = start; offset < end;) {
        const head = await reader.read(offset, 8), id = fourCC(head), size = head.getUint32(4, true), next = offset + 8 + size;
        if (next + (size & 1) > end) throw new Error("RIFF bounds");
        if (id === "LIST") {
          if (size < 4) throw new Error("LIST bounds");
          const type = fourCC(await reader.read(offset + 8, 4));
          if (type === "hdrl" && list === "root") await chunks(offset + 12, next, "hdrl");
          else if (type === "strl" && list === "hdrl") await chunks(offset + 12, next, "strl");
          else if (type === "movi" && list === "root") { if (movi || size < 12) throw new Error("movi"); movi = true; }
        } else if (id === "avih" && list === "hdrl") {
          if (main || size < 56) throw new Error("avih"); main = await reader.read(offset + 8, 56);
        } else if (id === "strh" && list === "strl") {
          if (stream || size < 56) throw new Error("strh"); stream = await reader.read(offset + 8, 56);
        } else if (id === "strf" && list === "strl") {
          if (format || size < 16) throw new Error("strf"); format = await reader.read(offset + 8, Math.min(size, 40));
        } else if (id === "idx1" && list === "root") {
          if (index || size < 16 || size % 16) throw new Error("idx1");
          const first = await reader.read(offset + 8, 16), last = await reader.read(next - 16, 16);
          if (!first.getUint32(12, true) || !last.getUint32(12, true)) throw new Error("Empty index");
          index = true;
        }
        offset = next + (size & 1);
      }
      if (list !== "strl") return;
      if (!stream || !format || !stream.getUint32(20, true) || !stream.getUint32(24, true) || !stream.getUint32(32, true) || stream.getUint32(28, true)) throw new Error("Stream timing");
      streamCount++;
      if (fourCC(stream) === "vids") {
        if (video || !MPEG4.has(fourCC(stream, 4).toUpperCase()) || format.byteLength < 40 || !MPEG4.has(fourCC(format, 16).toUpperCase())) throw new Error("Video codec");
        video = format;
      } else if (fourCC(stream) === "auds") {
        if (audio || format.getUint16(0, true) !== 0x55) throw new Error("Audio codec"); audio = format;
      } else throw new Error("Unsupported stream");
    }
    await chunks(12, file.size, "root");
    if (!main || !video || !movi || !index || !(main.getUint32(12, true) & 0x10) || main.getUint32(24, true) !== streamCount) return null;
    const width = video.getInt32(4, true), height = video.getInt32(8, true), channels = audio?.getUint16(2, true) ?? 0, sampleRate = audio?.getUint32(4, true) ?? 0;
    if (width <= 0 || height <= 0 || width * height > 1920 * 1080 || video.getUint16(12, true) !== 1 || (audio && (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 96000))) return null;
    return { width, height, audio: Boolean(audio), channels, sampleRate };
  } catch (error) { signal.throwIfAborted(); if (error instanceof DOMException && error.name === "AbortError") throw error; return null; }
}
export async function probeFfmpegVideo(context: ProbeViewerContext) { return await inspectAvi(context) ? 3 : 0; }
