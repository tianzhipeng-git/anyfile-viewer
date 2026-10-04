import { ViewerError, selectMessages, type Locale } from "@anyfile/viewer-protocol";

// 256 MiB of decoded RGBA pixels, excluding mipmaps and renderer overhead.
export function checkTexturePixelBudget(pixels: number, locale: Locale) {
  const limit = 64 * 1024 * 1024;
  if (pixels <= limit) return;
  const count = pixels.toLocaleString(locale);
  const maximum = limit.toLocaleString(locale);
  throw new ViewerError("resource-limit", selectMessages(locale, {
    en: `Model textures contain ${count} pixels; the viewer limit is ${maximum} pixels (256 MiB decoded RGBA).`,
    "zh-CN": `模型纹理共有 ${count} 像素，查看器上限为 ${maximum} 像素（解码为 RGBA 后 256 MiB）。`,
  }));
}

export async function imagePixels(blob: Blob) {
  if (blob.size > 16 * 1024 * 1024) throw new RangeError("Encoded texture budget");
  const bytes = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  let width = 0, height = 0;
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && view.getUint32(12) === 0x49484452) {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) throw new Error("Invalid JPEG marker");
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (length < 8) throw new Error("Invalid JPEG frame");
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  }
  if (!width || !height) throw new Error("Only bounded PNG/JPEG textures are supported");
  if (width > 8192 || height > 8192 || width * height > 16_777_216) throw new RangeError("Texture pixel budget");
  return width * height;
}
