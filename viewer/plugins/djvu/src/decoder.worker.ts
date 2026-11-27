/// <reference lib="webworker" />

import { importRuntime } from "@anyfile/runtime-assets";
import { createDjvuEngine, DjvuEngineError, type DjvuEmscriptenModule, type DjvuEngine } from "./engine";
import type { DjvuWorkerRequest, DjvuWorkerResponse } from "./types";

type DjvuModuleFactory = (options?: {
  locateFile?: (path: string) => string;
}) => Promise<DjvuEmscriptenModule>;

const workerScope = self as DedicatedWorkerGlobalScope;

let engine: DjvuEngine | undefined;

function post(response: DjvuWorkerResponse, transfer: Transferable[] = []) {
  workerScope.postMessage(response, transfer);
}

workerScope.onmessage = async (event: MessageEvent<DjvuWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "init") {
      const loaded = await importRuntime<{ default: DjvuModuleFactory }>(request.runtimeUrl);
      engine = createDjvuEngine(await loaded.default({
        locateFile(path: string) {
          return path.endsWith(".wasm") ? request.wasmUrl : path;
        },
      }));
      post({ type: "ready", id: request.id });
      return;
    }

    if (!engine) {
      post({ type: "error", id: request.id, code: "unsupported-environment", message: "DjVu runtime is not initialized." });
      return;
    }

    if (request.type === "open") {
      post({ type: "opened", id: request.id, document: engine.open(new Uint8Array(request.buffer)) });
      return;
    }

    if (request.type === "render") {
      const rendered = engine.render(request.pageIndex, request.width, request.height, request.thumbnail);
      post({ type: "rendered", id: request.id, ...rendered }, [rendered.rgba]);
      return;
    }

    if (request.type === "text") {
      post({ type: "text", id: request.id, pageText: engine.text(request.pageIndex) });
    }
  } catch (error) {
    const code = error instanceof DjvuEngineError
      ? error.code
      : request.type === "init"
        ? "unsupported-environment"
        : error instanceof RangeError
          ? "resource-limit"
          : "invalid-file";
    post({
      type: "error",
      id: request.id,
      code,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
