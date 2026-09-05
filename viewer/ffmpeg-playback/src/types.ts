export interface MediaInfo {
  duration: number; origin: number; video: boolean; audio: boolean;
  width: number; height: number; sampleRate: number; channels: number; videoCodec: string; audioCodec: string;
}
export interface DecodedFrame {
  kind: "video" | "audio"; data: ArrayBuffer; timestamp: number; duration: number;
  width: number; height: number; sampleRate: number; channels: number; samples: number;
}
export type DecodeEvent = DecodedFrame | { kind: "eof" };
