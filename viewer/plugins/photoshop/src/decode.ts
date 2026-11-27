import { getCompositeImageData, initializeCanvas, readPsd, type Layer, type PixelArray } from "ag-psd";

import type { PhotoshopDocumentInfo } from "./types";

export interface PhotoshopLayerSummary {
  readonly name: string;
  readonly depth: number;
  readonly visible: boolean;
  readonly isGroup: boolean;
  readonly opacity: number;
  readonly blendMode?: string;
  readonly left?: number;
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly text?: string;
}

const MAX_DECODED_BYTES = 256 * 1024 * 1024;

initializeCanvas(
  () => { throw new Error("Canvas creation is disabled in the Photoshop decoder."); },
  (width, height) => (
    typeof ImageData === "function"
      ? new ImageData(width, height)
      : ({ width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData)
  ),
);

const COLOR_MODES: Readonly<Record<number, string>> = {
  0: "Bitmap",
  1: "Grayscale",
  2: "Indexed",
  3: "RGB",
  4: "CMYK",
  7: "Multichannel",
  8: "Duotone",
  9: "Lab",
};

function countLayers(layers: readonly Layer[] | undefined) {
  let total = 0;
  let visible = 0;
  for (const layer of layers ?? []) {
    total += 1;
    if (!layer.hidden) visible += 1;
    const nested = countLayers(layer.children);
    total += nested.total;
    visible += nested.visible;
  }
  return { total, visible };
}

function byteValue(data: PixelArray, index: number) {
  const value = data[index] ?? 0;
  if (data instanceof Uint16Array) return value >>> 8;
  if (data instanceof Float32Array) {
    const linear = Math.min(1, Math.max(0, value));
    const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  }
  return value;
}

function toEightBitRgba(data: PixelArray, pixelCount: number) {
  if (data.length !== pixelCount * 4) throw new Error("Unexpected Photoshop composite pixel layout.");
  const rgba = new Uint8ClampedArray(data.length);
  if (data instanceof Uint8ClampedArray) rgba.set(data);
  else for (let index = 0; index < data.length; index += 1) rgba[index] = byteValue(data, index);
  return rgba;
}

function collectLayerSummaries(
  layers: readonly Layer[] | undefined,
  depth = 0,
  out: PhotoshopLayerSummary[] = [],
): PhotoshopLayerSummary[] {
  for (const layer of layers ?? []) {
    const isGroup = Array.isArray(layer.children);
    const text = typeof layer.text?.text === "string" ? layer.text.text.trim() : undefined;
    out.push({
      name: layer.name ?? "(unnamed)",
      depth,
      visible: !layer.hidden,
      isGroup,
      opacity: layer.opacity ?? 1,
      ...(layer.blendMode ? { blendMode: layer.blendMode } : {}),
      ...(layer.left !== undefined ? { left: layer.left } : {}),
      ...(layer.top !== undefined ? { top: layer.top } : {}),
      ...(layer.right !== undefined ? { right: layer.right } : {}),
      ...(layer.bottom !== undefined ? { bottom: layer.bottom } : {}),
      ...(text ? { text } : {}),
    });
    if (layer.children) collectLayerSummaries(layer.children, depth + 1, out);
  }
  return out;
}

export function inspectPhotoshopDocument(buffer: ArrayBuffer): {
  readonly info: PhotoshopDocumentInfo;
  readonly channels: number;
  readonly layers: readonly PhotoshopLayerSummary[];
} {
  const psd = readPsd(buffer, {
    skipCompositeImageData: true,
    skipLayerImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    totalMemoryLimit: MAX_DECODED_BYTES,
  });
  const layerCounts = countLayers(psd.children);
  const info: PhotoshopDocumentInfo = {
    width: psd.width,
    height: psd.height,
    depth: psd.bitsPerChannel ?? 8,
    colorMode: COLOR_MODES[psd.colorMode ?? 3] ?? `Mode ${psd.colorMode}`,
    layerCount: layerCounts.total,
    visibleLayerCount: layerCounts.visible,
  };
  return {
    info,
    channels: psd.channels ?? 3,
    layers: collectLayerSummaries(psd.children),
  };
}

export function decodePhotoshop(buffer: ArrayBuffer) {
  const psd = readPsd(buffer, {
    useImageData: true,
    skipLayerImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    totalMemoryLimit: MAX_DECODED_BYTES,
  });
  const pixels = psd.imageData ?? getCompositeImageData(psd);
  if (!pixels || pixels.width !== psd.width || pixels.height !== psd.height) {
    throw new Error("Photoshop composite preview is missing.");
  }
  const pixelCount = psd.width * psd.height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount * 4 > MAX_DECODED_BYTES) {
    throw new RangeError("Photoshop composite preview is too large.");
  }
  const layers = countLayers(psd.children);
  const info: PhotoshopDocumentInfo = {
    width: psd.width,
    height: psd.height,
    depth: psd.bitsPerChannel ?? 8,
    colorMode: COLOR_MODES[psd.colorMode ?? 3] ?? `Mode ${psd.colorMode}`,
    layerCount: layers.total,
    visibleLayerCount: layers.visible,
  };
  return { info, rgba: toEightBitRgba(pixels.data, pixelCount) };
}
