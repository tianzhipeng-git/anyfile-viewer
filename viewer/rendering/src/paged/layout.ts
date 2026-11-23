export const DEFAULT_MIN_SCALE = 0.25;
export const DEFAULT_MAX_SCALE = 3;
export const DEFAULT_SCALE_STEP = 0.2;
export const DEFAULT_MAX_RENDER_PIXELS = 16_000_000;
export const DEFAULT_MAX_ACTIVE_CANVAS_PAGES = 6;
export const DEFAULT_MAX_ACTIVE_THUMBNAILS = 24;

export function clampScale(
  scale: number,
  minScale = DEFAULT_MIN_SCALE,
  maxScale = DEFAULT_MAX_SCALE,
): number {
  if (!Number.isFinite(scale)) return minScale;
  return Math.min(maxScale, Math.max(minScale, scale));
}

export function calculateFitWidthScale(
  viewportWidth: number,
  pageWidth: number,
  horizontalPadding: number,
  minScale = DEFAULT_MIN_SCALE,
  maxScale = DEFAULT_MAX_SCALE,
): number {
  if (pageWidth <= 0) return 1;
  const availableWidth = Math.max(120, viewportWidth - horizontalPadding);
  return clampScale(availableWidth / pageWidth, minScale, maxScale);
}

export function calculateFitPageScale(
  viewportWidth: number,
  viewportHeight: number,
  pageWidth: number,
  pageHeight: number,
  horizontalPadding: number,
  verticalPadding: number,
  minScale = DEFAULT_MIN_SCALE,
  maxScale = DEFAULT_MAX_SCALE,
): number {
  if (pageWidth <= 0 || pageHeight <= 0) return 1;
  const availableWidth = Math.max(120, viewportWidth - horizontalPadding);
  const availableHeight = Math.max(120, viewportHeight - verticalPadding);
  return clampScale(Math.min(availableWidth / pageWidth, availableHeight / pageHeight), minScale, maxScale);
}

export function computeCanvasPixelSize(
  displayWidth: number,
  displayHeight: number,
  devicePixelRatio: number,
  maxPixels = DEFAULT_MAX_RENDER_PIXELS,
): { readonly width: number; readonly height: number; readonly pixelRatio: number } {
  const safeDisplayW = Math.max(1, displayWidth);
  const safeDisplayH = Math.max(1, displayHeight);
  const clampedDpr = Math.min(Math.max(1, devicePixelRatio || 1), 2);
  const maxAxisRatio = Math.sqrt(Math.max(1, maxPixels) / (safeDisplayW * safeDisplayH));
  const pixelRatio = Math.min(clampedDpr, maxAxisRatio);
  return {
    width: Math.max(1, Math.floor(safeDisplayW * pixelRatio)),
    height: Math.max(1, Math.floor(safeDisplayH * pixelRatio)),
    pixelRatio,
  };
}

/**
 * Selects the index in `activePages` to evict: strongly prefers offscreen pages,
 * and breaks ties by greatest distance from `currentPage`.
 */
export function selectEvictionCandidate(
  activePages: readonly number[],
  keepIndex: number,
  currentPage: number,
  visibleIndices: ReadonlySet<number>,
): number {
  let evictAt = -1;
  let bestScore = -1;
  for (let i = 0; i < activePages.length; i += 1) {
    const candidate = activePages[i];
    if (candidate === keepIndex) continue;
    const distance = Math.abs(candidate - currentPage);
    const score = (visibleIndices.has(candidate) ? 0 : 1_000_000) + distance;
    if (score > bestScore) {
      bestScore = score;
      evictAt = i;
    }
  }
  return evictAt;
}

export function paintRgbaToCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  rgba: ArrayBuffer | Uint8ClampedArray,
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  const pixels = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
  if (typeof ImageData !== "undefined") {
    ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  }
}

export function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError")
    || (error instanceof Error && error.name === "AbortError")
  );
}
