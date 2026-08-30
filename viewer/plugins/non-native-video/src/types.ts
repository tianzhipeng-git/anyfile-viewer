export type SupportedVideoCodec = "avc" | "hevc" | "vp8" | "vp9" | "av1";
export type SupportedAudioCodec = "aac" | "opus" | "vorbis" | "mp3" | "flac";

export interface ProbeTrack {
  readonly type: "video" | "audio";
  readonly codecId: string;
  readonly codec: SupportedVideoCodec | SupportedAudioCodec;
  readonly width?: number;
  readonly height?: number;
}

export interface MatroskaInspection {
  readonly tracks: readonly ProbeTrack[];
  readonly hasSeekIndex: boolean;
}

export interface MpegTsInspection {
  readonly videoCodec: "avc" | "hevc";
  readonly audioCodec: "aac" | "mp3" | null;
}
