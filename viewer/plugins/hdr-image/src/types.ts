import type { ViewerErrorCode } from "@anyfile/viewer-protocol";

export const MAX_HDR_INPUT_BYTES = 256 * 1024 * 1024;
export const MAX_HDR_EDGE = 16384;
export const MAX_HDR_PIXELS = 33_554_432; // 32 Mi pixels (supports 8K 8192x4096 HDRI)
export const MAX_EXR_PARTS = 64;
export const MAX_EXR_CHANNELS = 512;
export const HDR_PROBE_BYTES = 8192;

export type HdrFormatKind = "openexr" | "radiance-hdr";

export type ToneMapOperator = "aces" | "reinhard" | "filmic" | "linear";

export type ChannelInspectMode = "rgb" | "r" | "g" | "b" | "a" | "luminance" | "false-color";

export interface ToneMapOptions {
  readonly exposure: number;
  readonly gamma: number;
  readonly operator: ToneMapOperator;
  readonly channelMode: ChannelInspectMode;
}

export interface HdrAovLayer {
  readonly id: string;
  readonly label: string;
  readonly channels: readonly string[];
  readonly kind: "rgba" | "rgb" | "vector" | "scalar";
  readonly hasAlpha: boolean;
}

export interface HdrPartSummary {
  readonly index: number;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly compression: string;
  readonly tiled: boolean;
  readonly envmap?: "latlong" | "cube";
  readonly layers: readonly HdrAovLayer[];
  readonly channelCount: number;
}

export interface HdrMetadataEntry {
  readonly key: string;
  readonly value: string;
}

export interface HdrDynamicRange {
  readonly minLuminance: number;
  readonly maxLuminance: number;
  readonly logAverageLuminance: number;
  readonly suggestedExposure: number;
}

export interface HdrDecodedFrame {
  readonly format: HdrFormatKind;
  readonly width: number;
  readonly height: number;
  readonly partIndex: number;
  readonly layerId: string;
  readonly hasAlpha: boolean;
  readonly isEquirectangular: boolean;
  readonly parts: readonly HdrPartSummary[];
  readonly metadata: readonly HdrMetadataEntry[];
  readonly dynamicRange: HdrDynamicRange;
  /** Linear float32 RGBA pixels (length = width * height * 4). */
  readonly rgba: Float32Array;
}

export type HdrWorkerRequest =
  | { readonly id: number; readonly type: "open"; readonly file: File }
  | { readonly id: number; readonly type: "select"; readonly partIndex: number; readonly layerId: string };

export type HdrWorkerResponse =
  | { readonly id: number; readonly type: "frame"; readonly frame: HdrDecodedFrame }
  | { readonly id: number; readonly type: "error"; readonly code: ViewerErrorCode; readonly message: string };
