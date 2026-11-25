import type { ChannelInspectMode, HdrDynamicRange, ToneMapOperator, ToneMapOptions } from "./types";

export const DEFAULT_TONE_MAP: ToneMapOptions = {
  exposure: 0,
  gamma: 2.2,
  operator: "aces",
  channelMode: "rgb",
};

function acesFilmic(x: number): number {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

function reinhard(x: number): number {
  if (x <= 0) return 0;
  return x / (1 + x);
}

function filmicCurve(x: number): number {
  const a = 0.15;
  const b = 0.50;
  const c = 0.10;
  const d = 0.20;
  const e = 0.02;
  const f = 0.30;
  return ((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f;
}

const FILMIC_WHITE_SCALE = 1 / filmicCurve(11.2);

function uncharted2Filmic(x: number): number {
  if (x <= 0) return 0;
  return Math.max(0, Math.min(1, filmicCurve(x * 2.0) * FILMIC_WHITE_SCALE));
}

function applyOperator(value: number, operator: ToneMapOperator): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  switch (operator) {
    case "aces":
      return acesFilmic(value);
    case "reinhard":
      return reinhard(value);
    case "filmic":
      return uncharted2Filmic(value);
    case "linear":
      return Math.min(1, value);
  }
}

/** Maps an EV stop value in [-6, +6] to an intuitive VFX false-color RGB triplet (0..255). */
function falseColorForLuminance(lum: number): [number, number, number] {
  if (!Number.isFinite(lum) || lum <= 0) return [12, 14, 48];
  const ev = Math.log2(lum / 0.18);
  // Stops: <-5 deep blue, -3 cyan, 0 green (18% gray), +2 yellow, +4 orange, >=+6 red/magenta
  const t = Math.max(0, Math.min(1, (ev + 6) / 12));
  const stops: ReadonlyArray<readonly [number, number, number]> = [
    [20, 24, 96],    // -6 EV
    [24, 92, 214],   // -4 EV
    [32, 184, 210],  // -2 EV
    [64, 196, 86],   //  0 EV (middle gray)
    [238, 218, 52],  // +2 EV
    [245, 130, 32],  // +4 EV
    [236, 36, 68],   // +6 EV
  ];
  const scaled = t * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const a = stops[idx];
  const b = stops[idx + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

export function computeDynamicRange(rgba: Float32Array, width: number, height: number): HdrDynamicRange {
  const totalPixels = width * height;
  if (totalPixels === 0) {
    return { minLuminance: 0, maxLuminance: 0, logAverageLuminance: 0, suggestedExposure: 0 };
  }
  const stride = Math.max(1, Math.floor(totalPixels / 65536));
  let minLum = Infinity;
  let maxLum = 0;
  let logSum = 0;
  let count = 0;

  for (let p = 0; p < totalPixels; p += stride) {
    const i = p * 4;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
    const lum = Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b);
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
    logSum += Math.log(lum + 1e-4);
    count++;
  }

  if (count === 0 || !Number.isFinite(minLum)) {
    return { minLuminance: 0, maxLuminance: 0, logAverageLuminance: 0, suggestedExposure: 0 };
  }

  const logAverageLuminance = Math.exp(logSum / count);
  const rawEv = logAverageLuminance > 1e-6 ? Math.log2(0.18 / logAverageLuminance) : 0;
  const suggestedExposure = Math.max(-10, Math.min(10, Math.round(rawEv * 10) / 10));
  return { minLuminance: minLum, maxLuminance: maxLum, logAverageLuminance, suggestedExposure };
}

export function toneMapToRgba8(
  src: Float32Array,
  dst: Uint8ClampedArray,
  options: ToneMapOptions,
): void {
  const exposureScale = Math.pow(2, options.exposure);
  const invGamma = 1 / Math.max(0.1, options.gamma);
  const operator = options.operator;
  const mode: ChannelInspectMode = options.channelMode;
  const pixelCount = Math.min(src.length >>> 2, dst.length >>> 2);

  if (mode === "false-color") {
    for (let p = 0; p < pixelCount; p++) {
      const i = p * 4;
      const r = src[i] * exposureScale;
      const g = src[i + 1] * exposureScale;
      const b = src[i + 2] * exposureScale;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const [fr, fg, fb] = falseColorForLuminance(lum);
      dst[i] = fr;
      dst[i + 1] = fg;
      dst[i + 2] = fb;
      dst[i + 3] = 255;
    }
    return;
  }

  if (mode === "a") {
    for (let p = 0; p < pixelCount; p++) {
      const i = p * 4;
      const a = src[i + 3];
      const v = Number.isFinite(a) ? Math.max(0, Math.min(255, Math.round(a * 255))) : 0;
      dst[i] = v;
      dst[i + 1] = v;
      dst[i + 2] = v;
      dst[i + 3] = 255;
    }
    return;
  }

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    let r = src[i] * exposureScale;
    let g = src[i + 1] * exposureScale;
    let b = src[i + 2] * exposureScale;

    if (mode === "r") {
      g = r;
      b = r;
    } else if (mode === "g") {
      r = g;
      b = g;
    } else if (mode === "b") {
      r = b;
      g = b;
    } else if (mode === "luminance") {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = y;
      g = y;
      b = y;
    }

    const tr = Math.pow(applyOperator(r, operator), invGamma);
    const tg = Math.pow(applyOperator(g, operator), invGamma);
    const tb = Math.pow(applyOperator(b, operator), invGamma);
    dst[i] = Math.round(tr * 255);
    dst[i + 1] = Math.round(tg * 255);
    dst[i + 2] = Math.round(tb * 255);
    dst[i + 3] = 255;
  }
}

export function isLikelyEquirectangular(width: number, height: number, envmap?: "latlong" | "cube"): boolean {
  if (envmap === "latlong") return true;
  if (envmap === "cube") return false;
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= 1.95 && ratio <= 2.05;
}
