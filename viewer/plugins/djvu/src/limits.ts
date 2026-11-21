export const DJVU_LIMITS = {
  maxInputBytes: 128 * 1024 * 1024,
  maxPages: 5_000,
  maxPageSourcePixels: 250_000_000,
  maxRenderPixels: 16_000_000,
  maxThumbnailPixels: 320 * 480,
  maxActiveCanvasPages: 5,
  maxActiveThumbnails: 24,
  maxTextWordsPerPage: 20_000,
  initTimeoutMs: 20_000,
  operationTimeoutMs: 30_000,
} as const;
