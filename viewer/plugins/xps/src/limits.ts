export const XPS_LIMITS = {
  /** Parts are read lazily from the ZIP, so the whole file is never buffered. */
  maxInputBytes: 512 * 1024 * 1024,
  entries: 50_000,
  pages: 10_000,
  /** One decompressed XML part (FixedPage, FixedDocument, dictionary…). */
  xmlBytes: 64 * 1024 * 1024,
  fontBytes: 32 * 1024 * 1024,
  imageBytes: 64 * 1024 * 1024,
  /** Pixels of one decoded image. */
  imagePixels: 64 * 1024 * 1024,
  /** Elements produced by one FixedPage (paths, glyph runs, canvases). */
  pageNodes: 200_000,
  /** Glyphs of one page. */
  pageGlyphs: 500_000,
  nestingDepth: 64,
  outlineEntries: 10_000,
  /** Decoded fonts / images kept alive across pages. */
  fontCacheBytes: 128 * 1024 * 1024,
  imageCachePixels: 96 * 1024 * 1024,
  maxRenderPixels: 16 * 1024 * 1024,
  maxActiveCanvasPages: 6,
  maxActiveThumbnails: 40,
};
