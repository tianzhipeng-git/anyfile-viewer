import { ViewerError } from "@anyfile/viewer-protocol";
import { fromBlob } from "geotiff";

import { checkedPixelCount, MAX_TIFF_PAGES } from "./limits";
import type { DecodedRaster } from "./types";

const compressionNames: Record<number, string> = {
  1: "none",
  5: "LZW",
  7: "JPEG",
  8: "Deflate",
  32946: "Deflate",
  32773: "PackBits",
  34887: "LERC",
  50000: "Zstandard",
  50001: "WebP",
};

function invalid(message = "TIFF 文件损坏或使用了不支持的变体。"): never {
  throw new ViewerError("invalid-file", message);
}

function applyOrientation(source: Uint8ClampedArray, width: number, height: number, orientation: number) {
  if (orientation === 1) return { rgba: source, width, height };
  const swapsAxes = orientation >= 5 && orientation <= 8;
  const outputWidth = swapsAxes ? height : width;
  const outputHeight = swapsAxes ? width : height;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let targetX: number;
      let targetY: number;
      switch (orientation) {
        case 2: targetX = width - 1 - x; targetY = y; break;
        case 3: targetX = width - 1 - x; targetY = height - 1 - y; break;
        case 4: targetX = x; targetY = height - 1 - y; break;
        case 5: targetX = y; targetY = x; break;
        case 6: targetX = height - 1 - y; targetY = x; break;
        case 7: targetX = height - 1 - y; targetY = width - 1 - x; break;
        case 8: targetX = y; targetY = width - 1 - x; break;
        default: targetX = x; targetY = y;
      }
      const sourceOffset = (y * width + x) * 4;
      const targetOffset = (targetY * outputWidth + targetX) * 4;
      output[targetOffset] = source[sourceOffset];
      output[targetOffset + 1] = source[sourceOffset + 1];
      output[targetOffset + 2] = source[sourceOffset + 2];
      output[targetOffset + 3] = source[sourceOffset + 3];
    }
  }
  return { rgba: output, width: outputWidth, height: outputHeight };
}

export async function decodeTiff(file: File, pageIndex: number, signal: AbortSignal): Promise<DecodedRaster> {
  const tiff = await fromBlob(file, signal);
  const pageCount = await tiff.getImageCount();
  if (pageCount < 1 || pageCount > MAX_TIFF_PAGES) {
    throw new ViewerError("resource-limit", `TIFF 页数超过 ${MAX_TIFF_PAGES} 页上限。`);
  }
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) invalid("TIFF 页码无效。");
  const image = await tiff.getImage(pageIndex);
  const width = image.getWidth();
  const height = image.getHeight();
  const pixels = checkedPixelCount(width, height);
  const directory = image.getFileDirectory();
  const sampleFormatValue = await directory.loadValue("SampleFormat");
  const sampleFormats = sampleFormatValue == null ? [1] : Array.from(sampleFormatValue as ArrayLike<number>);
  if (sampleFormats.some((value) => value !== 1)) invalid("通用 TIFF 查看器不把有符号或浮点样本误作普通颜色图片。");
  const bitsValue = await directory.loadValue("BitsPerSample");
  const bits = bitsValue == null ? [8] : Array.from(bitsValue as ArrayLike<number>);
  if (bits.some((value) => value < 1 || value > 16)) invalid("当前 TIFF 查看器只支持每通道 1–16 bit 的整数样本。");
  const bitDepth = Math.max(...bits);
  const rgb = await image.readRGB({ interleave: true, enableAlpha: true, signal });
  const channels = rgb.length / pixels;
  if (channels !== 3 && channels !== 4) invalid();
  const photometric = Number(await directory.loadValue("PhotometricInterpretation") ?? 1);
  const maximum = photometric === 2 ? 2 ** bitDepth - 1 : 255;
  const rgba = new Uint8ClampedArray(pixels * 4);
  const extraSamplesValue = await directory.loadValue("ExtraSamples");
  const extraSamples = extraSamplesValue == null ? [] : Array.from(extraSamplesValue as ArrayLike<number>);
  const associatedAlpha = channels === 4 && extraSamples[0] === 1;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const input = pixel * channels;
    const output = pixel * 4;
    let red = Math.round((Number(rgb[input]) * 255) / maximum);
    let green = Math.round((Number(rgb[input + 1]) * 255) / maximum);
    let blue = Math.round((Number(rgb[input + 2]) * 255) / maximum);
    const alpha = channels === 4 ? Math.round((Number(rgb[input + 3]) * 255) / maximum) : 255;
    if (associatedAlpha && alpha > 0 && alpha < 255) {
      red = Math.min(255, Math.round((red * 255) / alpha));
      green = Math.min(255, Math.round((green * 255) / alpha));
      blue = Math.min(255, Math.round((blue * 255) / alpha));
    }
    rgba[output] = red;
    rgba[output + 1] = green;
    rgba[output + 2] = blue;
    rgba[output + 3] = alpha;
  }
  const orientationValue = Number(await directory.loadValue("Orientation") ?? 1);
  const orientation = orientationValue >= 1 && orientationValue <= 8 ? orientationValue : 1;
  const oriented = applyOrientation(rgba, width, height, orientation);
  const hasIcc = directory.hasTag("ICCProfile");
  const compression = Number(await directory.loadValue("Compression") ?? 1);
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const big = header[0] === 0x49 ? header[2] === 43 : header[3] === 43;
  return {
    width: oriented.width,
    height: oriented.height,
    rgba: oriented.rgba,
    format: big ? "BigTIFF" : "TIFF",
    bitDepth,
    hasAlpha: channels === 4,
    colorSpace: hasIcc ? "unknown" : "sRGB",
    orientation,
    orientationApplied: true,
    icc: hasIcc ? "preserved-not-applied" : "none",
    pageIndex,
    pageCount,
    tiled: image.isTiled,
    compression: compressionNames[compression] ?? `TIFF ${compression}`,
  };
}
