export type VideoContainer = "MP4" | "QuickTime" | "3GPP" | "WebM";

export interface ParsedVideoTrack {
  readonly codec: string;
  readonly codecString: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ParsedAudioTrack {
  readonly codec: string;
  readonly codecString: string;
  readonly channels?: number;
  readonly sampleRate?: number;
}

export interface VideoFileInspection {
  readonly container: VideoContainer;
  readonly mimeType: string;
  readonly videoTracks: readonly ParsedVideoTrack[];
  readonly audioTracks: readonly ParsedAudioTrack[];
  readonly codecsSupported: boolean;
}
