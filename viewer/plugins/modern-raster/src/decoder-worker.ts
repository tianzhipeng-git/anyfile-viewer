/// <reference lib="webworker" />

import { ViewerError } from "@anyfile/viewer-protocol";
import { MAX_JXL_FRAMES, MAX_JXL_SOURCE_BYTES, checkDimensions } from "./limits";
import type { JxlWorkerRequest, JxlWorkerResponse } from "./types";

const worker = self as unknown as DedicatedWorkerGlobalScope;
let image: import("jxl-oxide-wasm").JxlImage | undefined;

function frameDuration(result: import("jxl-oxide-wasm").RenderResult) {
  const denominator = result.durationDenominator;
  const duration = denominator > 0 ? (result.durationNumerator / denominator) * 1000 : result.duration * 1000;
  return Math.max(16, Number.isFinite(duration) ? duration : 100);
}

function renderFrame(frameIndex: number) {
  if (!image) throw new ViewerError("open-failed", "JPEG XL decoder 尚未初始化。");
  const result = image.render(frameIndex);
  const durationMs = frameDuration(result);
  // encodeToPng consumes the wasm RenderResult; calling free() afterwards double-frees it.
  return { png: result.encodeToPng(), durationMs };
}

async function openJxl(file: File) {
  if (file.size > MAX_JXL_SOURCE_BYTES) throw new ViewerError("resource-limit", "JPEG XL 文件超过 256 MiB 输入上限。");
  const jxlPackage = await import("jxl-oxide-wasm");
  await jxlPackage.default();
  image?.free();
  image = new jxlPackage.JxlImage();
  image.forceSrgb = true;
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    image.feedBytes(new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer()));
    image.tryInit();
  }
  image.tryInit();
  const width = image.width;
  const height = image.height;
  if (!image.loaded || width === undefined || height === undefined) throw new ViewerError("invalid-file", "JPEG XL 文件不完整或无法解码。");
  checkDimensions(width, height);
  const frameCount = Math.max(1, image.numLoadedKeyframes);
  if (frameCount > MAX_JXL_FRAMES) throw new ViewerError("resource-limit", "JPEG XL 动画超过 4096 帧上限。");
  return { width, height, frameCount, loops: image.numLoops ?? 0, ...renderFrame(0) };
}

worker.addEventListener("message", async (event: MessageEvent<JxlWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "open") {
      const opened = await openJxl(request.file);
      const response: JxlWorkerResponse = { type: "opened", id: request.id, ...opened };
      worker.postMessage(response, [opened.png.buffer]);
    } else {
      const frame = renderFrame(request.frameIndex);
      const response: JxlWorkerResponse = { type: "frame", id: request.id, frameIndex: request.frameIndex, ...frame };
      worker.postMessage(response, [frame.png.buffer]);
    }
  } catch (error) {
    const known = error instanceof ViewerError;
    const response: JxlWorkerResponse = {
      type: "error",
      id: request.id,
      code: known && error.code !== "unsupported-environment" && error.code !== "missing-related-file" ? error.code : "invalid-file",
      message: known ? error.message : "JPEG XL 解码失败。",
    };
    worker.postMessage(response);
  }
});
