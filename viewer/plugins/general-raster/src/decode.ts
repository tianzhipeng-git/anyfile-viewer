import { ViewerError } from "@anyfile/viewer-protocol";

import { decodePnm } from "./decode-pnm";
import { decodeTga } from "./decode-tga";
import { decodeTiff } from "./decode-tiff";
import { MAX_SOURCE_BYTES, PROBE_BYTES } from "./limits";
import { inspectRasterHeader } from "./probe-format";
import { readBlob } from "./read-blob";
import type { DecodedRaster } from "./types";

export async function decodeRaster(file: File, pageIndex: number, signal: AbortSignal): Promise<DecodedRaster> {
  const header = await readBlob(file.slice(0, PROBE_BYTES), signal);
  const probe = inspectRasterHeader(header, file.size);
  if (!probe) throw new ViewerError("invalid-file", "文件不是受支持的 TGA、Netpbm 或 TIFF 图片。");
  if (probe.format === "TIFF" || probe.format === "BigTIFF") return decodeTiff(file, pageIndex, signal);
  if (pageIndex !== 0) throw new ViewerError("invalid-file", "单页图片的页码无效。");
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ViewerError("resource-limit", "TGA/Netpbm 文件超过 256 MiB 输入上限。");
  }
  const bytes = await readBlob(file, signal);
  return probe.format === "TGA" ? decodeTga(bytes) : decodePnm(bytes);
}
