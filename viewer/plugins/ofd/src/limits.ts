export const OFD_LIMITS = {
  /** Parts are read lazily from the ZIP, so the whole file is never buffered. */
  maxInputBytes: 512 * 1024 * 1024,
  entries: 50_000,
  pages: 10_000,
  /** One decompressed XML part (page content, resources, signatures…). */
  xmlBytes: 64 * 1024 * 1024,
  fontBytes: 32 * 1024 * 1024,
  imageBytes: 64 * 1024 * 1024,
  /** A signature value / seal file (holds the stamp picture or a nested seal OFD). */
  sealBytes: 16 * 1024 * 1024,
  /** Pixels of one decoded image. */
  imagePixels: 64 * 1024 * 1024,
  /** Graphic objects produced by one page (templates and annotations included). */
  pageNodes: 200_000,
  /** Positioned glyphs of one page. */
  pageGlyphs: 500_000,
  /** PageBlock / CompositeObject nesting. */
  nestingDepth: 32,
  outlineEntries: 10_000,
  /** Decoded fonts / images kept alive across pages. */
  fontCacheBytes: 128 * 1024 * 1024,
  imageCachePixels: 96 * 1024 * 1024,
  /** Raster resolution of a nested seal OFD (pixels per millimetre, ~300 dpi). */
  sealPixelsPerMm: 12,
  sealMaxPixels: 4 * 1024 * 1024,
  maxRenderPixels: 16 * 1024 * 1024,
  maxActiveCanvasPages: 6,
  maxActiveThumbnails: 40,
};
