import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { abortError, type BinarySource, type RgbaImage, type VendorAssets } from "@anyfile/viewer-protocol";
import type { JxlImage } from "jxl-oxide-wasm";
import { loadHeifRuntimeFromVendor, type HeifDecoderModule } from "./heif-runtime";
import { checkDimensions } from "./limits";
import { decodePng } from "./png-decode";

/** Node-callable decode paths for `./extract`; the browser keeps its own Worker shells. */
let jxlRuntime: Promise<typeof import("jxl-oxide-wasm")> | undefined;
let heifRuntime: Promise<HeifDecoderModule> | undefined;

function loadJxlRuntime() {
  jxlRuntime ??= (async () => {
    const jxl = await import("jxl-oxide-wasm");
    const wasm = await readFile(fileURLToPath(import.meta.resolve("jxl-oxide-wasm/module.wasm")));
    await jxl.default({ module_or_path: wasm });
    return jxl;
  })().catch((error: unknown) => {
    jxlRuntime = undefined;
    throw error;
  });
  return jxlRuntime;
}

export function loadHeifDecoder(vendor: VendorAssets) {
  heifRuntime ??= loadHeifRuntimeFromVendor(vendor).catch((error: unknown) => {
    heifRuntime = undefined;
    throw error;
  });
  return heifRuntime;
}

export interface JxlSession {
  readonly image: JxlImage;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly animated: boolean;
  readonly loops: number;
}

/** Feeds the whole JPEG XL stream; callers must `image.free()` when done. */
export async function openJxl(source: BinarySource, signal: AbortSignal): Promise<JxlSession> {
  const jxl = await loadJxlRuntime();
  const image = new jxl.JxlImage();
  try {
    image.forceSrgb = true;
    const chunkSize = 4 * 1024 * 1024;
    for (let offset = 0; offset < source.size; offset += chunkSize) {
      if (signal.aborted) throw abortError();
      image.feedBytes(await source.read(offset, chunkSize, signal));
      image.tryInit();
    }
    image.tryInit();
    const { width, height } = image;
    if (!image.loaded || width === undefined || height === undefined) throw new Error("JPEG XL stream is incomplete or undecodable.");
    checkDimensions(width, height);
    return { image, width, height, frameCount: Math.max(1, image.numLoadedKeyframes), animated: image.animated === true, loops: image.numLoops ?? 0 };
  } catch (error) {
    image.free();
    throw error;
  }
}

/** jxl-oxide only exposes PNG output; decode it back to RGBA8 in-process. */
export function renderJxlFrame(session: JxlSession, frameIndex: number) {
  return decodePng(session.image.render(frameIndex).encodeToPng());
}

export function downscaleRgba(src: Uint8ClampedArray, width: number, height: number, maxDimension: number): RgbaImage {
  const bound = Math.floor(maxDimension);
  if (width <= bound && height <= bound) return { width, height, data: src };
  const scale = bound / Math.max(width, height);
  const dstWidth = Math.max(1, Math.min(bound, Math.round(width * scale)));
  const dstHeight = Math.max(1, Math.min(bound, Math.round(height * scale)));
  const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  // Box filter: average every source pixel that falls inside each destination cell.
  for (let y = 0; y < dstHeight; y++) {
    const sy0 = Math.floor((y * height) / dstHeight);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * height) / dstHeight));
    for (let x = 0; x < dstWidth; x++) {
      const sx0 = Math.floor((x * width) / dstWidth);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * width) / dstWidth));
      const sum = [0, 0, 0, 0];
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * width + sx) * 4;
          sum[0] += src[i]; sum[1] += src[i + 1]; sum[2] += src[i + 2]; sum[3] += src[i + 3];
        }
      }
      const count = (sy1 - sy0) * (sx1 - sx0);
      dst.set(sum.map((value) => Math.round(value / count)), (y * dstWidth + x) * 4);
    }
  }
  return { width: dstWidth, height: dstHeight, data: dst };
}
