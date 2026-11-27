import { ViewerError } from "@anyfile/viewer-protocol";

import { identifyFormat } from "./format-registry";
import { parseGzipTar } from "./parsers/gzip-tar";
import { parseRar } from "./parsers/rar";
import { parseTar } from "./parsers/tar";
import { parseWrapper } from "./parsers/wrappers";
import type { RangeReader } from "./range-reader";
import type { ArchiveMetadata, IdentifiedFormat } from "./types";
import { parseZip } from "./zip-adapter";

async function identificationBytes(reader: RangeReader, fileName: string): Promise<Uint8Array> {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".tar") || normalized.endsWith(".deflate") ||
      normalized.endsWith(".dfl") || normalized.endsWith(".br")) return new Uint8Array();
  if (reader.size < 2) throw new ViewerError("invalid-file", "压缩文件头已截断。");
  const prefix = await reader.read(0, 2, "header");
  let length = 2;
  if ((prefix[0] === 0x1f && prefix[1] === 0x8b)) length = 3;
  else if ((prefix[0] === 0xfd && prefix[1] === 0x37)) length = 6;
  else if (prefix[0] === 0x52 && prefix[1] === 0x61) length = 8;
  else if ((prefix[0] === 0x42 && prefix[1] === 0x5a) || prefix[0] === 0x50 && prefix[1] === 0x4b ||
    prefix[0] === 0x28 && prefix[1] === 0xb5 || prefix[0] === 0x04 && prefix[1] === 0x22) length = 4;
  else if (prefix[0] === 0x4a && prefix[1] === 0x4d) length = 8;
  if (length === 2) return prefix;
  const suffix = await reader.read(2, length - 2, "header");
  const result = new Uint8Array(length);
  result.set(prefix);
  result.set(suffix, 2);
  return result;
}

export async function identifyArchive(file: File, reader: RangeReader): Promise<IdentifiedFormat> {
  return identifyFormat(file.name, await identificationBytes(reader, file.name));
}

/** DOM-free metadata parse shared by the browser viewer and the Node `./extract`. */
export async function parseArchive(
  file: File,
  reader: RangeReader,
  format: IdentifiedFormat,
  signal: AbortSignal,
): Promise<ArchiveMetadata> {
  if (format.id === "zip" || format.id === "jmod") return parseZip(reader, format, signal);
  if (format.id === "rar") return parseRar(reader, format);
  if (format.id === "tar") return parseTar(reader, format);
  if (format.id === "gzip" && format.compoundTar) {
    try {
      return await parseGzipTar(file, reader, format, signal);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (error instanceof ViewerError && error.code === "resource-limit") throw error;
      return parseWrapper(reader, format);
    }
  }
  return parseWrapper(reader, format);
}
