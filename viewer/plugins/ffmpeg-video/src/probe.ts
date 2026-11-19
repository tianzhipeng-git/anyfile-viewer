import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
import { inspectAsf } from "@anyfile/ffmpeg-playback/probe-asf";

import { inspectAvi } from "./probe-avi";
import { inspectMpegPs } from "./probe-ps";

export interface VideoInfo {
  container: "avi" | "asf" | "mpeg-ps";
  width: number;
  height: number;
  videoCodec: "mpeg4" | "wmv2" | "mpeg2video";
  audio: boolean;
  audioCodec: "mp3" | "wmav2" | "ac3" | "mp2" | "";
  channels: number;
  sampleRate: number;
}

/** Container-specific inspection of one supported container × main-track combination. */
export async function inspectVideo(context: ProbeViewerContext): Promise<VideoInfo | null> {
  const avi = await inspectAvi(context);
  if (avi) return { container: "avi", videoCodec: "mpeg4", audioCodec: avi.audio ? "mp3" : "", ...avi };
  const asf = await inspectAsf(context);
  if (asf?.video && (!asf.audio || asf.audio.codec === "wmav2")) {
    return {
      container: "asf", videoCodec: asf.video.codec, width: asf.video.width, height: asf.video.height,
      audio: Boolean(asf.audio), audioCodec: asf.audio ? "wmav2" : "",
      channels: asf.audio?.channels ?? 0, sampleRate: asf.audio?.sampleRate ?? 0,
    };
  }
  const ps = await inspectMpegPs(context);
  if (ps) {
    return {
      container: "mpeg-ps", videoCodec: "mpeg2video", width: ps.width, height: ps.height,
      audio: Boolean(ps.audioCodec), audioCodec: ps.audioCodec ?? "", channels: ps.channels, sampleRate: ps.sampleRate,
    };
  }
  return null;
}

export async function probeFfmpegVideo(context: ProbeViewerContext) {
  return await inspectVideo(context) ? 3 : 0;
}
