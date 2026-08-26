import type { OpenViewerContext, ViewerProgress } from "@anyfile/viewer-protocol";

export interface ViewerTestContext {
  readonly abortController: AbortController;
  readonly container: HTMLDivElement;
  readonly context: OpenViewerContext;
  readonly outside: HTMLDivElement;
  readonly progress: ViewerProgress[];
  cleanup(): void;
}

export function createViewerTestContext(file: File): ViewerTestContext {
  const outside = document.createElement("div");
  outside.dataset.viewerTestOutside = "untouched";
  const container = document.createElement("div");
  document.body.append(outside, container);
  const abortController = new AbortController();
  const progress: ViewerProgress[] = [];

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
