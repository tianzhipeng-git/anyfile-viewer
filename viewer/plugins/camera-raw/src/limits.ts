import { ViewerError } from "@anyfile/viewer-protocol";

export const PROBE_BYTES = 1024 * 1024;
export const MAX_RAW_SOURCE_BYTES = 256 * 1024 * 1024;
export const MAX_RAW_PIXELS = 64 * 1024 * 1024;

export function checkRawDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new ViewerError("invalid-file", "RAW 图片尺寸无效。");
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_RAW_PIXELS) throw new ViewerError("resource-limit", "RAW 图片解码后超过 64 Mi 像素上限。");
  return pixels;
}
