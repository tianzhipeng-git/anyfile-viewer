import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
import { inspectAsf } from "@anyfile/ffmpeg-playback/probe-asf";
import { ProbeReader, fourCC } from "@anyfile/ffmpeg-playback/probe-io";

export interface AiffInfo { codec: string; channels: number; sampleRate: number; duration: number }
export interface WmaInfo { codec: "wmav1" | "wmav2"; channels: number; sampleRate: number }
export type FfmpegAudioInfo =
  | ({ container: "aiff" } & AiffInfo)
  | ({ container: "asf" } & WmaInfo);

export async function inspectAiff({ file, signal }: ProbeViewerContext): Promise<AiffInfo | null> {
  try {
    const reader = new ProbeReader(file, signal), header = await reader.read(0, 12);
    const kind = fourCC(header, 8);
    if (fourCC(header) !== "FORM" || !["AIFF", "AIFC"].includes(kind) || header.getUint32(4) + 8 !== file.size) return null;
    let info: AiffInfo | null = null, dataBytes: number | undefined, requiredBytes = 0, version = false;
    for (let offset = 12; offset < file.size;) {
      const chunk = await reader.read(offset, 8), id = fourCC(chunk), size = chunk.getUint32(4);
      const end = offset + 8 + size;
      if (end > file.size) return null;
      if (id === "COMM") {
        if (info || size < (kind === "AIFC" ? 22 : 18)) return null;
        const comm = await reader.read(offset + 8, Math.min(size, 22));
        const channels = comm.getUint16(0), frames = comm.getUint32(2), bits = comm.getUint16(6);
        const exponent = comm.getUint16(8);
        const sampleRate = (comm.getUint32(10) * 2 ** 32 + comm.getUint32(14)) * 2 ** (exponent - 16383 - 63);
        const compression = kind === "AIFC" ? fourCC(comm, 18).toLowerCase() : "none";
        const codec = compression === "none" && [16, 24].includes(bits) ? `pcm_s${bits}be` : compression === "fl32" && bits === 32 ? "pcm_f32be" : null;
        if (!codec || ![1, 2].includes(channels) || !frames || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000 || exponent & 0x8000) return null;
        requiredBytes = frames * channels * (bits / 8);
        info = { codec, channels, sampleRate, duration: frames / sampleRate };
      } else if (id === "SSND") {
        if (dataBytes !== undefined || size < 8) return null;
        const sound = await reader.read(offset + 8, 8), skip = sound.getUint32(0);
        if (sound.getUint32(4) !== 0 || skip > size - 8) return null;
        dataBytes = size - 8 - skip;
      } else if (id === "FVER") {
        if (version || size !== 4 || (await reader.read(offset + 8, 4)).getUint32(0) !== 0xa2805140) return null;
        version = true;
      }
      offset = end + (size & 1);
      if (offset > file.size) return null;
    }
    return info && dataBytes === requiredBytes && (kind === "AIFF" || version) ? info : null;
  } catch (error) { signal.throwIfAborted(); if (error instanceof DOMException && error.name === "AbortError") throw error; return null; }
}

/** ASF audio-only: exactly one supported WMA stream and no main video program. */
export async function inspectWma(context: ProbeViewerContext): Promise<WmaInfo | null> {
  const info = await inspectAsf(context);
  return info && !info.video ? info.audio : null;
}

export async function inspectAudio(context: ProbeViewerContext): Promise<FfmpegAudioInfo | null> {
  const aiff = await inspectAiff(context);
  if (aiff) return { container: "aiff", ...aiff };
  const wma = await inspectWma(context);
  return wma ? { container: "asf", ...wma } : null;
}

export async function probeFfmpegAudio(context: ProbeViewerContext) {
  return await inspectAudio(context) ? 3 : 0;
}
