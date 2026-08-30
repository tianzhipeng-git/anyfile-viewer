import { ViewerError } from "@anyfile/viewer-protocol";

import { formatBytes, view } from "../binary";
import type { RangeReader } from "../range-reader";
import type { ArchiveMetadata, IdentifiedFormat } from "../types";
import { parseWrapper } from "./wrappers";
import { SequentialReader } from "./sequential-reader";
import { parseTar } from "./tar";

const MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 1_000;

function decompressionStream(file: File): ReadableStream<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new ViewerError("unsupported-environment", "当前浏览器不支持 gzip 流式解压。");
  }
  return file.stream().pipeThrough(new DecompressionStream("gzip"));
}

export async function parseGzipTar(
  file: File,
  rangeReader: RangeReader,
  format: IdentifiedFormat,
  signal: AbortSignal,
): Promise<ArchiveMetadata> {
  const wrapper = await parseWrapper(rangeReader, format);
  const trailer = view(await rangeReader.read(file.size - 4, 4, "trailer"));
  const declaredSize = trailer.getUint32(0, true);
  if (declaredSize > MAX_DECOMPRESSED_BYTES) {
    throw new ViewerError("resource-limit", "压缩 TAR 解压后大小超过 512 MiB 安全上限。");
  }
  if (declaredSize > Math.max(1024 * 1024, file.size * MAX_COMPRESSION_RATIO)) {
    throw new ViewerError("resource-limit", "压缩 TAR 的压缩比超过 1000:1 安全上限。");
  }

  const sequential = new SequentialReader(decompressionStream(file).getReader(), signal, MAX_DECOMPRESSED_BYTES);
  try {
    const tar = await parseTar(sequential, format);
    return {
      ...tar,
      format: "gzip + TAR",
      detectedBy: `扩展名 ${format.extension}、gzip 标识与内部 TAR 头部`,
      fields: [
        ...wrapper.fields,
        ...tar.fields,
        { label: "声明解压大小", value: `${formatBytes(declaredSize)} 字节（gzip ISIZE）` },
      ],
    };
  } finally {
    await sequential.close();
  }
}
