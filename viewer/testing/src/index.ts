import type { OpenViewerContext, ViewerOpenProgress } from "@anyfile/viewer-protocol";

export interface ViewerTestContext {
  readonly abortController: AbortController;
  readonly container: HTMLDivElement;
  readonly context: OpenViewerContext;
  readonly outside: HTMLDivElement;
  readonly progress: ViewerOpenProgress[];
  cleanup(): void;
}

export function createViewerTestContext(file: File): ViewerTestContext {
  const outside = document.createElement("div");
  outside.dataset.viewerTestOutside = "untouched";
  const container = document.createElement("div");
  document.body.append(outside, container);
  const abortController = new AbortController();
  const progress: ViewerOpenProgress[] = [];

  return {
    abortController,
    container,
    outside,
    progress,
    context: {
      file,
      container,
      signal: abortController.signal,
      locale: "zh-CN",
      reportProgress(value) {
        progress.push(value);
      },
    },
    cleanup() {
      abortController.abort();
      outside.remove();
      container.remove();
    },
  };
}

export function createDeferredFile(fileName: string, fileSize: number) {
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      cancelled = true;
    },
  });
  const file = {
    name: fileName,
    size: fileSize,
    type: "application/octet-stream",
    slice() {
      return { stream: () => stream };
    },
  } as unknown as File;

  return {
    file,
    wasCancelled: () => cancelled,
    resolveRead(bytes: ArrayBuffer) {
      streamController.enqueue(new Uint8Array(bytes));
      streamController.close();
    },
  };
}

export type ByteOrder = "big" | "little";

export function integerBytes(
  value: number | bigint,
  byteLength: 1 | 2 | 4 | 8,
  order: ByteOrder,
): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  const littleEndian = order === "little";
  if (byteLength === 1) view.setUint8(0, Number(value));
  else if (byteLength === 2) view.setUint16(0, Number(value), littleEndian);
  else if (byteLength === 4) view.setUint32(0, Number(value), littleEndian);
  else view.setBigUint64(0, BigInt(value), littleEndian);
  return bytes;
}

export function unsignedVarint(value: number | bigint): Uint8Array {
  let remaining = BigInt(value);
  if (remaining < BigInt(0)) throw new RangeError("Unsigned varints cannot encode negative values.");
  const bytes: number[] = [];
  do {
    const byte = Number(remaining & BigInt(0x7f));
    remaining >>= BigInt(7);
    bytes.push(byte | (remaining ? 0x80 : 0));
  } while (remaining);
  return Uint8Array.from(bytes);
}

export function signedVarint(value: number | bigint): Uint8Array {
  let remaining = BigInt(value);
  const bytes: number[] = [];
  let more = true;
  while (more) {
    let byte = Number(remaining & BigInt(0x7f));
    remaining >>= BigInt(7);
    const signBit = (byte & 0x40) !== 0;
    more = !((remaining === BigInt(0) && !signBit) || (remaining === BigInt(-1) && signBit));
    if (more) byte |= 0x80;
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

export function truncated(bytes: Uint8Array, length = bytes.length - 1): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0 || length >= bytes.length) {
    throw new RangeError("Truncation length must be inside the fixture.");
  }
  return bytes.slice(0, length);
}

export type TrackedRead = { readonly start: number; readonly end: number };

export function createTrackedFile(bytes: Uint8Array, name: string) {
  const file = new File([bytes.slice().buffer as ArrayBuffer], name);
  const slice = file.slice.bind(file);
  const reads: TrackedRead[] = [];
  Object.defineProperty(file, "slice", {
    configurable: true,
    value(start = 0, end = file.size, contentType?: string) {
      const normalizedStart = Number(start);
      const normalizedEnd = Number(end);
      reads.push({ start: normalizedStart, end: normalizedEnd });
      return slice(start, end, contentType);
    },
  });
  return { file, reads };
}

export function assertReadsWithin(
  reads: readonly TrackedRead[],
  allowed: readonly TrackedRead[],
): void {
  for (const read of reads) {
    const contained = allowed.some(({ start, end }) => read.start >= start && read.end <= end);
    if (!contained) throw new Error(`Unexpected fixture read [${read.start}, ${read.end}).`);
  }
}
