import { ViewerError } from "@anyfile/viewer-protocol";

export const PROBE_BYTES = 1024 * 1024;
export const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
export const MAX_DECODED_PIXELS = 64 * 1024 * 1024;
export const MAX_TIFF_PAGES = 1024;

export function checkedPixelCount(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new ViewerError("invalid-file", "图片尺寸无效。");
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels)) {
    throw new ViewerError("resource-limit", "图片尺寸超出安全范围。");
  }
  if (pixels > MAX_DECODED_PIXELS) {
    throw new ViewerError("resource-limit", "图片解码后超过 64 Mi 像素上限。");
  }
  return pixels;
}
