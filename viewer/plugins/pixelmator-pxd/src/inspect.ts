const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const MAX_COMMENT_LENGTH = 0xffff;
const MAX_DIRECTORY_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

const previewNames = new Set([
  "QuickLook/Thumbnail.webp",
  "QuickLook/Thumbnail.png",
  "QuickLook/Thumbnail.jpg",
  "QuickLook/Thumbnail.jpeg",
  "QuickLook/Thumbnail.tiff",
  "QuickLook/Thumbnail.tif",
]);

export type PxdInspection = {
  readonly hasMetadata: boolean;
  readonly previewName?: string;
  readonly zip64: boolean;
};

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function read(file: File, start: number, end: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return new Uint8Array(await Promise.race([file.slice(start, end).arrayBuffer(), aborted]));
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function findEocd(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    if (offset + 22 + view.getUint16(offset + 20, true) === bytes.length) return offset;
  }
  return -1;
}

export async function inspectPxd(file: File, signal: AbortSignal): Promise<PxdInspection | undefined> {
  if (file.size < 22) return undefined;
  const tailStart = Math.max(0, file.size - 22 - MAX_COMMENT_LENGTH);
  const tail = await read(file, tailStart, file.size, signal);
  const eocdOffset = findEocd(tail);
  if (eocdOffset < 0) return undefined;

  const eocd = new DataView(tail.buffer, tail.byteOffset + eocdOffset, 22);
  const entryCount = eocd.getUint16(10, true);
  const directorySize = eocd.getUint32(12, true);
  const directoryOffset = eocd.getUint32(16, true);
  const zip64 = entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff;
  if (zip64) return { hasMetadata: false, zip64: true };
  if (entryCount > MAX_ENTRIES || directorySize > MAX_DIRECTORY_BYTES) return undefined;
  if (!Number.isSafeInteger(directoryOffset + directorySize) || directoryOffset + directorySize > file.size) {
    return undefined;
  }

  const directory = await read(file, directoryOffset, directoryOffset + directorySize, signal);
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let offset = 0;
  let hasMetadata = false;
  let previewName: string | undefined;
  for (let index = 0; index < entryCount; index += 1) {
    if (signal.aborted) throw abortError();
    if (offset + 46 > directory.length || view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE) return undefined;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > directory.length) return undefined;
    let name: string;
    try {
      name = decoder.decode(directory.subarray(offset + 46, offset + 46 + nameLength));
    } catch {
      return undefined;
    }
    hasMetadata ||= name === "metadata.info";
    if (!previewName && previewNames.has(name)) previewName = name;
    offset = end;
  }
  if (offset !== directory.length) return undefined;
  return { hasMetadata, previewName, zip64: false };
}

export function isPxdPreviewName(name: string) {
  return previewNames.has(name);
}
