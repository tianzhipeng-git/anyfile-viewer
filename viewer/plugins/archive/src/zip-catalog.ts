import { ViewerError } from "@anyfile/viewer-protocol";
import { view } from "./binary";
import { RangeReader } from "./range-reader";
import { readDirectoryLayout } from "./zip-layout";

export const BOOK_ZIP_LIMITS = {
  entries: 10_000,
  directory: 4 * 1024 * 1024,
  entry: 32 * 1024 * 1024,
  expanded: 2 * 1024 ** 3,
  ratio: 1000,
};
export function safeBookPath(path: string): boolean {
  return (
    !!path &&
    !/[\\\x00-\x1f:]/.test(path) &&
    !path.startsWith("/") &&
    !path.split("/").some((part) => part === ".." || part === ".") &&
    path.length <= 2048
  );
}

/** Index only: no ZIP decoder, DOM, image runtime or payload reads. */
export async function readBookZipCatalog(file: File, signal: AbortSignal) {
  const reader = new RangeReader(file, signal, 5 * 1024 * 1024);
  if (file.size > 2 * 1024 ** 3)
    throw new ViewerError("resource-limit", "ZIP file limit exceeded.");
  const signature = await reader.read(0, 4, "header");
  if (view(signature).getUint32(0, true) !== 0x04034b50)
    throw new ViewerError("invalid-file", "Invalid ZIP signature.");
  const layout = await readDirectoryLayout(reader);
  if (layout.split) throw new ViewerError("invalid-file", "Split ZIP is not supported.");
  if (
    layout.entryCount > BOOK_ZIP_LIMITS.entries ||
    layout.directoryLength > BOOK_ZIP_LIMITS.directory
  ) {
    throw new ViewerError("resource-limit", "ZIP index limit exceeded.");
  }
  const bytes = await reader.read(layout.directoryOffset, layout.directoryLength, "directory");
  const data = view(bytes);
  const names = new Set<string>();
  let offset = 0;
  for (let i = 0; i < layout.entryCount; i++) {
    reader.throwIfAborted();
    if (offset + 46 > bytes.length || data.getUint32(offset, true) !== 0x02014b50)
      throw new ViewerError("invalid-file", "Invalid ZIP directory.");
    const length = data.getUint16(offset + 28, true);
    const end = offset + 46 + length;
    const next = end + data.getUint16(offset + 30, true) + data.getUint16(offset + 32, true);
    if (next > bytes.length) throw new ViewerError("invalid-file", "Truncated ZIP directory.");
    // Routing needs only ASCII OCF paths / image suffixes. Runtime zip.js decodes legacy names.
    const rawName = bytes.subarray(offset + 46, end);
    const name =
      data.getUint16(offset + 8, true) & 0x800
        ? new TextDecoder("utf-8", { fatal: true }).decode(rawName)
        : Array.from(rawName, (byte) => String.fromCharCode(byte)).join("");
    if (!safeBookPath(name) || names.has(name))
      throw new ViewerError("invalid-file", "Unsafe or duplicate ZIP path.");
    names.add(name);
    offset = next;
  }
  if (offset !== bytes.length)
    throw new ViewerError("invalid-file", "Unexpected ZIP directory data.");
  return { names, layout };
}
