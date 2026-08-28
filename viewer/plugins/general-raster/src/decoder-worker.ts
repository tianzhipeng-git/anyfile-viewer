/// <reference lib="webworker" />

import { ViewerError } from "@anyfile/viewer-protocol";

import { decodeRaster } from "./decode";
import type { WorkerRequest, WorkerResponse } from "./types";

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type !== "decode") return;
  try {
    const raster = await decodeRaster(request.file, request.pageIndex, new AbortController().signal);
    const response: WorkerResponse = { type: "result", id: request.id, raster };
    worker.postMessage(response, [raster.rgba.buffer]);
  } catch (error) {
    const known = error instanceof ViewerError && (error.code === "invalid-file" || error.code === "resource-limit");
    const response: WorkerResponse = {
      type: "error",
      id: request.id,
      code: known ? error.code as "invalid-file" | "resource-limit" : "invalid-file",
      message: known ? error.message : "图片解码失败。",
    };
    worker.postMessage(response);
  }
});
