import { ViewerError } from "@anyfile/viewer-protocol";
import type LibRaw from "libraw-wasm";
import type { Metadata } from "libraw-wasm";

export const MAX_RAW_SOURCE_BYTES = 256 * 1024 * 1024;
export const MAX_RAW_PIXELS = 64 * 1024 * 1024;

export interface RawMetadataSummary {
  readonly make?: string;
  readonly model?: string;
  readonly width?: number;
  readonly height?: number;
  readonly iso?: number;
}

interface LibRawPackage {
  default: typeof LibRaw;
}

type RawMetadataSource = Pick<Metadata, "camera_make" | "camera_model" | "width" | "height" | "iso_speed">;

export function summarizeRawMetadata(metadata: RawMetadataSource): RawMetadataSummary {
  return {
    make: typeof metadata.camera_make === "string" ? metadata.camera_make.trim() : undefined,
    model: typeof metadata.camera_model === "string" ? metadata.camera_model.trim() : undefined,
    width: typeof metadata.width === "number" ? metadata.width : undefined,
    height: typeof metadata.height === "number" ? metadata.height : undefined,
    iso: typeof metadata.iso_speed === "number" ? metadata.iso_speed : undefined,
  };
}

const LIBRAW_MODULE_URL = "/vendor/libraw/1.6.0/index.js";
const RAW_OPEN_TIMEOUT_MS = 60_000;

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

export function checkRawDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new ViewerError("invalid-file", "RAW image dimensions are invalid.");
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_RAW_PIXELS) {
    throw new ViewerError("resource-limit", "The developed RAW image exceeds the 64-megapixel limit.");
  }
  return pixels;
}

export class RawDecoder {
  private decoder?: LibRaw;
  private disposed = false;

  constructor(private readonly signal: AbortSignal) {
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  async open(bytes: Uint8Array<ArrayBuffer>, options: { halfSize?: boolean } = {}) {
    if (this.disposed || this.signal.aborted) throw abortError();
    const libRawPackage = await import(/* webpackIgnore: true */ LIBRAW_MODULE_URL) as LibRawPackage;
    if (this.disposed || this.signal.aborted) throw abortError();
    this.decoder = new libRawPackage.default();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.decoder.open(bytes, {
          useCameraWb: true,
          useAutoWb: false,
          useCameraMatrix: 1,
          outputColor: 1,
          outputBps: 8,
          userFlip: -1,
          halfSize: options.halfSize,
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            this.decoder?.dispose();
            reject(new ViewerError("open-failed", "RAW decoder initialization timed out."));
          }, RAW_OPEN_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
    if (this.disposed || this.signal.aborted) throw abortError();
  }

  async metadata(): Promise<RawMetadataSummary> {
    const metadata = await this.decoder?.metadata(false);
    return metadata ? summarizeRawMetadata(metadata) : {};
  }

  async thumbnail() {
    const thumbnail = await this.decoder?.thumbnailData();
    if (!thumbnail) return undefined;
    checkRawDimensions(thumbnail.width, thumbnail.height);
    if (thumbnail.format === "jpeg") {
      return createImageBitmap(new Blob([thumbnail.data.slice().buffer], { type: "image/jpeg" }));
    }
    if (thumbnail.format === "bitmap") return bitmapFromPixels(thumbnail.data, thumbnail.width, thumbnail.height);
    return undefined;
  }

  async developed() {
    const image = await this.decoder?.imageData();
    if (!image) throw new ViewerError("invalid-file", "The RAW file could not be developed.");
    checkRawDimensions(image.width, image.height);
    if (image.bits !== 8 || !(image.data instanceof Uint8Array)) {
      throw new ViewerError("open-failed", "The RAW decoder returned an unexpected pixel format.");
    }
    return bitmapFromPixels(image.data, image.width, image.height, image.colors);
  }

  readonly dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.signal.removeEventListener("abort", this.dispose);
    this.decoder?.dispose();
    this.decoder = undefined;
  };
}

async function bitmapFromPixels(data: Uint8Array, width: number, height: number, channels?: number) {
  const pixels = checkRawDimensions(width, height);
  const sourceChannels = channels ?? data.byteLength / pixels;
  if ((sourceChannels !== 3 && sourceChannels !== 4) || data.byteLength !== pixels * sourceChannels) {
    throw new ViewerError("invalid-file", "The RAW pixel buffer length is invalid.");
  }
  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let source = 0, target = 0; source < data.length; source += sourceChannels, target += 4) {
    rgba[target] = data[source];
    rgba[target + 1] = data[source + 1];
    rgba[target + 2] = data[source + 2];
    rgba[target + 3] = sourceChannels === 4 ? data[source + 3] : 255;
  }
  return createImageBitmap(new ImageData(rgba, width, height), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
}
