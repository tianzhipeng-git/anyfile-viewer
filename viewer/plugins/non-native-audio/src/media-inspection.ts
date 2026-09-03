import { ViewerError } from "@anyfile/viewer-protocol";
import {
  AudioBufferSink,
  BlobSource,
  Input,
  MATROSKA,
  WAVE,
  type InputAudioTrack,
  type InputFormat,
  type WrappedAudioBuffer,
} from "mediabunny";

import {
  BLOB_CACHE_BYTES,
  MATROSKA_CODECS,
  MAX_BUFFER_BYTES,
  MAX_BUFFER_SECONDS,
  MAX_CHANNELS,
  MAX_DURATION_SECONDS,
  MAX_SAMPLE_RATE,
  MAX_TRACKS,
  SOFTWARE_PCM_CODECS,
  WAVE_CODECS,
} from "./limits";
import { abortError } from "./abort-error";

export type AudioContainer = "Matroska" | "WAVE";

export interface AudioDescription {
  readonly input: Input<BlobSource>;
  readonly container: AudioContainer;
  readonly track: InputAudioTrack;
  readonly sink: AudioBufferSink;
  readonly firstBuffer: WrappedAudioBuffer;
  readonly codec: string;
  readonly channels: number;
  readonly sampleRate: number;
  readonly startTimestamp: number;
  readonly duration: number;
}

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

function expectedFormat(extension: string): { format: InputFormat; container: AudioContainer; codecs: Set<string> } | null {
  if (extension === ".mka") return { format: MATROSKA, container: "Matroska", codecs: MATROSKA_CODECS };
  if (extension === ".wav" || extension === ".wave") return { format: WAVE, container: "WAVE", codecs: WAVE_CODECS };
  return null;
}

function validateBuffer(buffer: WrappedAudioBuffer) {
  const bytes = buffer.buffer.length * buffer.buffer.numberOfChannels * 4;
  return Number.isFinite(buffer.timestamp) && buffer.timestamp >= 0
    && Number.isFinite(buffer.duration) && buffer.duration > 0 && buffer.duration <= MAX_BUFFER_SECONDS
    && Number.isSafeInteger(bytes) && bytes <= MAX_BUFFER_BYTES;
}

export async function inspectAudio(file: File, signal: AbortSignal): Promise<AudioDescription> {
  const expected = expectedFormat(extensionOf(file.name));
  if (!expected) throw new ViewerError("invalid-file", "音频扩展名不在当前支持范围内。");
  const input = new Input({
    source: new BlobSource(file, { maxCacheSize: BLOB_CACHE_BYTES }),
    formats: [expected.format],
  });
  const abort = () => input.dispose();
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw abortError();
    if (!await input.canRead() || await input.getFormat() !== expected.format) {
      throw new ViewerError("invalid-file", `文件不是有效的 ${expected.container} 音频。`);
    }
    const tracks = await input.getTracks();
    if (!tracks.length) throw new ViewerError("invalid-file", "文件没有媒体轨道。");
    if (tracks.length > MAX_TRACKS) throw new ViewerError("resource-limit", "轨道数量超出安全限制。");
    if ((await input.getVideoTracks()).length) throw new ViewerError("invalid-file", "文件包含主视频节目。");
    const audioTracks = await input.getAudioTracks();
    if (audioTracks.length !== 1) throw new ViewerError("invalid-file", "文件必须包含一个明确的主音轨。");
    const track = audioTracks[0];
    const codec = await track.getCodec();
    if (!codec || !expected.codecs.has(codec)) throw new ViewerError("invalid-file", "音频编码不在当前支持范围内。");
    const channels = await track.getNumberOfChannels();
    const sampleRate = await track.getSampleRate();
    if (channels < 1 || channels > MAX_CHANNELS || sampleRate < 8_000 || sampleRate > MAX_SAMPLE_RATE) {
      throw new ViewerError("resource-limit", "采样率或声道数超出安全限制。");
    }
    // A-law / μ-law use Mediabunny's software PCM path; track.canDecode() still consults
    // AudioDecoder.isConfigSupported and can falsely reject them.
    if (!SOFTWARE_PCM_CODECS.has(codec) && !await track.canDecode()) {
      throw new ViewerError("unsupported-environment", "当前浏览器不能解码这个主音轨。");
    }
    const duration = await input.getDurationFromMetadata([track], { skipLiveWait: true });
    const startTimestamp = Math.max(0, await track.getFirstTimestamp());
    if (duration === null || !Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS
      || !Number.isFinite(startTimestamp) || startTimestamp >= duration) {
      throw new ViewerError(duration && duration > MAX_DURATION_SECONDS ? "resource-limit" : "invalid-file", "文件缺少安全可用的时长或 seek 索引。");
    }
    const sink = new AudioBufferSink(track);
    const iterator = sink.buffers(startTimestamp);
    const result = await iterator.next();
    await iterator.return(undefined);
    if (result.done || !validateBuffer(result.value)) throw new ViewerError("invalid-file", "主音轨没有有效的首个 PCM buffer。");
    signal.removeEventListener("abort", abort);
    return {
      input,
      container: expected.container,
      track,
      sink,
      firstBuffer: result.value,
      codec,
      channels,
      sampleRate,
      startTimestamp,
      duration,
    };
  } catch (error) {
    signal.removeEventListener("abort", abort);
    input.dispose();
    if (signal.aborted) throw abortError();
    throw error;
  }
}
