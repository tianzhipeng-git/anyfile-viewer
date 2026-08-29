import { ViewerError } from "@anyfile/viewer-protocol";
import {
  BlobSource,
  Input,
  MATROSKA,
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny";

import {
  BLOB_CACHE_BYTES,
  MAX_CODED_DIMENSION,
  MAX_CODED_PIXELS,
  MAX_TRACKS,
  SUPPORTED_AUDIO_CODECS,
  SUPPORTED_VIDEO_CODECS,
} from "./playback-limits";
import { abortError } from "./abort-error";

export interface MediaDescription {
  readonly input: Input<BlobSource>;
  readonly videoTrack: InputVideoTrack;
  readonly audioTrack: InputAudioTrack | null;
  readonly videoCodec: string;
  readonly audioCodec: string | null;
  readonly audioStartTimestamp: number | null;
  readonly width: number;
  readonly height: number;
  readonly startTimestamp: number;
  readonly duration: number;
}

export async function inspectMedia(file: File, signal: AbortSignal): Promise<MediaDescription> {
  const input = new Input({
    source: new BlobSource(file, { maxCacheSize: BLOB_CACHE_BYTES }),
    formats: [MATROSKA],
  });
  const abort = () => input.dispose();
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw abortError();
    if (!await input.canRead() || await input.getFormat() !== MATROSKA) {
      throw new ViewerError("invalid-file", "文件不是有效的 Matroska 视频。");
    }
    const tracks = await input.getTracks();
    if (tracks.length < 1 || tracks.length > MAX_TRACKS) {
      throw new ViewerError("resource-limit", "视频轨道数量超出安全限制。");
    }
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new ViewerError("invalid-file", "文件没有视频轨道。");
    const videoCodec = await videoTrack.getCodec();
    if (!videoCodec || !SUPPORTED_VIDEO_CODECS.has(videoCodec)) {
      throw new ViewerError("invalid-file", "视频编码不在当前支持范围内。");
    }
    const width = await videoTrack.getCodedWidth();
    const height = await videoTrack.getCodedHeight();
    if (!width || !height || width > MAX_CODED_DIMENSION || height > MAX_CODED_DIMENSION
      || width * height > MAX_CODED_PIXELS) {
      throw new ViewerError("resource-limit", "视频尺寸超出安全解码限制。");
    }

    const audioTracks = await input.getAudioTracks();
    const audioTrack = audioTracks.length ? await videoTrack.getPrimaryPairableAudioTrack() : null;
    if (audioTracks.length && !audioTrack) {
      throw new ViewerError("invalid-file", "没有可与主视频配对的主音轨。");
    }
    const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
    if (audioTrack && (!audioCodec || !SUPPORTED_AUDIO_CODECS.has(audioCodec))) {
      throw new ViewerError("invalid-file", "主音频编码不在当前支持范围内。");
    }
    if (audioTrack && typeof AudioDecoder === "undefined") {
      throw new ViewerError("unsupported-environment", "当前浏览器缺少音频 WebCodecs 解码能力。");
    }
    if (!await videoTrack.canDecode() || (audioTrack && !await audioTrack.canDecode())) {
      throw new ViewerError("unsupported-environment", "当前浏览器不能解码这个视频的主轨道。");
    }

    const duration = await input.getDurationFromMetadata(
      audioTrack ? [videoTrack, audioTrack] : [videoTrack],
      { skipLiveWait: true },
    );
    if (duration === null || !Number.isFinite(duration) || duration <= 0) {
      throw new ViewerError("invalid-file", "视频缺少可用的时长或 seek 索引。");
    }
    const startTimestamp = Math.max(0, await videoTrack.getFirstTimestamp());
    if (!Number.isFinite(startTimestamp) || startTimestamp >= duration) {
      throw new ViewerError("invalid-file", "视频时间戳无效。");
    }
    const audioStartTimestamp = audioTrack ? Math.max(0, await audioTrack.getFirstTimestamp()) : null;
    if (audioStartTimestamp !== null
      && (!Number.isFinite(audioStartTimestamp) || audioStartTimestamp >= duration)) {
      throw new ViewerError("invalid-file", "主音轨时间戳无效。");
    }
    const result = {
      input,
      videoTrack,
      audioTrack,
      videoCodec,
      audioCodec,
      audioStartTimestamp,
      width,
      height,
      startTimestamp,
      duration,
    };
    signal.removeEventListener("abort", abort);
    return result;
  } catch (error) {
    signal.removeEventListener("abort", abort);
    input.dispose();
    if (signal.aborted) throw abortError();
    throw error;
  }
}
