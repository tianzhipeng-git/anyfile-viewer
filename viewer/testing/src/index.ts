import type { OpenViewerContext, ViewerOpenProgress, ViewerPreviewResult } from "@anyfile/viewer-protocol";
export interface ViewerTestContext {
  readonly abortController: AbortController;
  readonly container: HTMLDivElement;
  readonly context: OpenViewerContext;
  readonly outside: HTMLDivElement;
  readonly progress: ViewerOpenProgress[];
  readonly previews: ViewerPreviewResult[];
  cleanup(): void;
}

export function createViewerTestContext(file: File): ViewerTestContext {
  const outside = document.createElement("div");
  outside.dataset.viewerTestOutside = "untouched";
  const container = document.createElement("div");
  document.body.append(outside, container);
  const abortController = new AbortController();
  const progress: ViewerOpenProgress[] = [];
  const previews: ViewerPreviewResult[] = [];

  return {
    abortController,
    container,
    outside,
    progress,
    previews,
    context: {
      file,
      container,
      signal: abortController.signal,
      locale: "zh-CN",
      reportProgress(value) {
        progress.push(value);
      },
      reportPreview(result) {
        previews.push(result);
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
  // Copy into a tight ArrayBuffer. `bytes.slice()` on a Node Buffer returns a
  // shared view, so `.buffer` would expose the whole pooled slab; an explicit
  // copy respects the view's byteOffset/byteLength regardless of the input type.
  const file = new File([new Uint8Array(bytes)], name);
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

/**
 * Asserts a plugin reported a `success` preview signal of one of `kinds`.
 * Plugins that opt into `reportPreview` must report exactly one success after
 * their content is decoded and mounted.
 */
export function expectPreviewReported(
  test: Pick<ViewerTestContext, "previews">,
  kinds: readonly ViewerPreviewSuccessKind[],
): void {
  const success = test.previews.filter((result) => result.outcome === "success");
  if (success.length !== 1) {
    throw new Error(`Expected exactly one preview signal, received ${success.length}.`);
  }
  const [result] = success;
  if (result.outcome !== "success" || !kinds.includes(result.kind)) {
    throw new Error(`Expected a preview of ${kinds.join(" | ")}, received ${JSON.stringify(result)}.`);
  }
}

export type ViewerPreviewSuccessKind =
  | "static"
  | "animation"
  | "video_frame"
  | "video_playback"
  | "structure";
