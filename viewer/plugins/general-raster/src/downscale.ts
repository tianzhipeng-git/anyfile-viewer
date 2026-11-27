import { AgentError, type RgbaImage } from "@anyfile/viewer-protocol";

/** Box-filters an RGBA8 buffer so neither side exceeds `maxDimension` (Agent `renderImage`). */
export function downscaleRgba(image: RgbaImage, maxDimension: number, pluginId: string): RgbaImage {
  if (!Number.isFinite(maxDimension) || maxDimension < 1) {
    throw new AgentError("invalid-argument", `maxDimension must be a positive number, received ${maxDimension}.`, { pluginId });
  }
  const bound = Math.floor(maxDimension);
  const { width, height, data } = image;
  if (width <= bound && height <= bound) return image;
  const scale = bound / Math.max(width, height);
  const outWidth = Math.max(1, Math.min(bound, Math.round(width * scale)));
  const outHeight = Math.max(1, Math.min(bound, Math.round(height * scale)));
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    const y0 = Math.floor((y * height) / outHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / outHeight));
    for (let x = 0; x < outWidth; x += 1) {
      const x0 = Math.floor((x * width) / outWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / outWidth));
      const sum = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * width + sx) * 4;
          for (let c = 0; c < 4; c += 1) sum[c] += data[i + c];
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const o = (y * outWidth + x) * 4;
      for (let c = 0; c < 4; c += 1) out[o + c] = Math.round(sum[c] / count);
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}
