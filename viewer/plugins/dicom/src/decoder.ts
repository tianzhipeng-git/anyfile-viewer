import { ViewerError } from "@anyfile/viewer-protocol";
import { inspectDicom, type DicomSource } from "./header";
import { MAX_HEADER_BYTES, type RenderedFrame, type WindowSettings } from "./types";

export { inspectDicom, type DicomSource } from "./header";
const invalid = () => new ViewerError("invalid-file", "Invalid DICOM data.");

export async function openDicom(file: File): Promise<DicomSource> {
  const bytes = new Uint8Array(await file.slice(0, MAX_HEADER_BYTES).arrayBuffer());
  return inspectDicom(bytes, file.size);
}

export function windowPixel(value: number, window: WindowSettings, voi: string) {
  const { center, width } = window;
  if (voi === "SIGMOID") return 255 / (1 + Math.exp(-4 * (value - center) / width));
  if (voi === "LINEAR_EXACT") return Math.max(0, Math.min(255, ((value - center) / width + 0.5) * 255));
  if (width === 1) return value <= center - 0.5 ? 0 : 255;
  return Math.max(0, Math.min(255, ((value - (center - 0.5)) / (width - 1) + 0.5) * 255));
}

export function renderFrame(source: DicomSource, bytes: Uint8Array, requested?: WindowSettings): RenderedFrame {
  const { info } = source;
  if (info.reason || bytes.length !== source.frameBytes) throw invalid();
  const pixels = info.width * info.height;
  const rgba = new Uint8ClampedArray(pixels * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = info.syntax !== "1.2.840.10008.1.2.2";
  const modulus = 2 ** source.stored;
  const sample = (i: number) => {
    const raw = info.bits === 8 ? bytes[i] : view.getUint16(i * 2, little);
    const masked = (raw >>> (source.highBit + 1 - source.stored)) & (modulus - 1);
    return source.signed && masked >= modulus / 2 ? masked - modulus : masked;
  };
  const isPadding = (v: number) => source.padding && v >= source.padding[0] && v <= source.padding[1];
  let window = requested ?? source.window;
  if (!window) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pixels; i++) {
      const raw = sample(i);
      if (isPadding(raw)) continue;
      const v = raw * source.slope + source.intercept;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    window = Number.isFinite(min) ? { center: (min + max + 1) / 2, width: Math.max(1, max - min + 1) } : { center: 0, width: 1 };
  }
  if (!Number.isFinite(window.center) || !Number.isFinite(window.width) || window.width < 1) throw invalid();
  for (let i = 0; i < pixels; i++) {
    if (info.photometric === "RGB") {
      for (let channel = 0; channel < 3; channel++) rgba[i * 4 + channel] = bytes[source.planar ? channel * pixels + i : i * 3 + channel];
    } else {
      const raw = sample(i);
      let gray = windowPixel(raw * source.slope + source.intercept, window, requested || source.window ? source.voi : "LINEAR");
      if (info.photometric === "MONOCHROME1") gray = 255 - gray;
      if (isPadding(raw)) gray = 0;
      rgba.fill(gray, i * 4, i * 4 + 3);
    }
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, window };
}

export async function readFrame(file: File, source: DicomSource, frame: number, window?: WindowSettings) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= source.info.frames || source.info.reason) throw invalid();
  const offset = source.offset + frame * source.frameBytes;
  return renderFrame(source, new Uint8Array(await file.slice(offset, offset + source.frameBytes).arrayBuffer()), window);
}
