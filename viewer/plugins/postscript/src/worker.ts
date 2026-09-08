/// <reference lib="webworker" />

import type {
  PostscriptPageInfo,
  PostscriptWorkerRequest,
  PostscriptWorkerResponse,
} from "./types";

type StetPage = {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  free(): void;
};

type StetRuntime = {
  default(options: { module_or_path: string }): Promise<unknown>;
  create_interpreter(): unknown;
  render(interpreter: unknown, bytes: Uint8Array, dpi: number, fileName: string): number;
  render_viewport(
    interpreter: unknown,
    pageIndex: number,
    x: number,
    y: number,
    viewportWidth: number,
    viewportHeight: number,
    pixelWidth: number,
    pixelHeight: number,
  ): StetPage;
  page_dimensions(interpreter: unknown, pageIndex: number): ArrayLike<number>;
  ps_stream_active(interpreter: unknown): boolean;
  step_ps_page(interpreter: unknown): number;
};

const workerScope = self as DedicatedWorkerGlobalScope;
let runtime: StetRuntime | undefined;
let interpreter: unknown;
let knownPages = 0;

function post(response: PostscriptWorkerResponse, transfer: Transferable[] = []) {
  workerScope.postMessage(response, transfer);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function pageInfo(index: number): PostscriptPageInfo {
  if (!runtime || !interpreter) throw new Error("PostScript runtime is not initialized.");
  const dimensions = runtime.page_dimensions(interpreter, index);
  const width = Number(dimensions[0]);
  const height = Number(dimensions[1]);
  const dpi = Number(dimensions[2]);
  if (![width, height, dpi].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("PostScript page dimensions are invalid.");
  }
  return { width, height, dpi };
}

function collectPages(start: number, end: number) {
  return Array.from({ length: Math.max(0, end - start) }, (_, index) => pageInfo(start + index));
}

workerScope.onmessage = async (event: MessageEvent<PostscriptWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "init") {
      runtime = await import(/* webpackIgnore: true */ request.runtimeUrl) as StetRuntime;
      await runtime.default({ module_or_path: request.wasmUrl });
      interpreter = runtime.create_interpreter();
      post({ type: "ready", id: request.id });
      return;
    }

    if (!runtime || !interpreter) throw new Error("PostScript runtime is not initialized.");

    if (request.type === "open") {
      knownPages = Number(runtime.render(interpreter, new Uint8Array(request.buffer), 150, request.fileName));
      if (!Number.isInteger(knownPages) || knownPages < 1) throw new Error("The document contains no renderable pages.");
      const streaming = runtime.ps_stream_active(interpreter);
      post({ type: "opened", id: request.id, pages: collectPages(0, knownPages), streaming });
      return;
    }

    if (request.type === "step") {
      const count = Number(runtime.step_ps_page(interpreter));
      const pages = collectPages(knownPages, count);
      knownPages = count;
      post({ type: "stepped", id: request.id, pages, done: !runtime.ps_stream_active(interpreter) });
      return;
    }

    if (request.width < 1 || request.height < 1 || request.width * request.height > 16_000_000) {
      post({ type: "error", id: request.id, code: "resource-limit", message: "PostScript render size exceeds limits." });
      return;
    }
    const dimensions = pageInfo(request.pageIndex);
    const page = runtime.render_viewport(
      interpreter,
      request.pageIndex,
      0,
      0,
      dimensions.width,
      dimensions.height,
      request.width,
      request.height,
    );
    const rgba = page.rgba;
    const width = page.width;
    const height = page.height;
    page.free();
    const rgbaBuffer = rgba.buffer as ArrayBuffer;
    post({ type: "rendered", id: request.id, width, height, rgba: rgbaBuffer }, [rgbaBuffer]);
  } catch (error) {
    post({
      type: "error",
      id: request.id,
      code: request.type === "init" ? "open-failed" : "invalid-file",
      message: errorMessage(error),
    });
  }
};

export {};
