import type { ViewerErrorCode } from "@anyfile/viewer-protocol";

export const MAX_HEADER_BYTES = 8 * 1024 * 1024;
export const MAX_FRAME_PIXELS = 16 * 1024 * 1024;
export type MetadataOnlyReason = "syntax" | "pixels" | "transform" | "noImage";
export interface DicomInfo {
  syntax: string;
  modality: string;
  date: string;
  sopClass: string;
  width: number;
  height: number;
  frames: number;
  bits: number;
  photometric: string;
  reason?: MetadataOnlyReason;
}
export interface WindowSettings { center: number; width: number }
export interface RenderedFrame {
  rgba: Uint8ClampedArray;
  window: WindowSettings;
}
export type WorkerRequest =
  | { id: number; type: "open"; file: File }
  | { id: number; type: "frame"; frame: number; window?: WindowSettings };
export type WorkerResponse =
  | { id: number; type: "info"; info: DicomInfo }
  | { id: number; type: "frame"; result: RenderedFrame }
  | { id: number; type: "error"; code: ViewerErrorCode };
