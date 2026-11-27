/// <reference lib="webworker" />

import { MAX_HEIF_SOURCE_BYTES } from "./limits";
import { classifyHeifError, loadHeifRuntime } from "./heif-runtime";
import type { HeifWorkerRequest, HeifWorkerResponse } from "./types";

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.addEventListener("message", async (event: MessageEvent<HeifWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.file.size > MAX_HEIF_SOURCE_BYTES) throw new Error("resource-limit: HEIF 文件超过 128 MiB 输入上限。");
    let decoder;
    try {
      decoder = await loadHeifRuntime();
    } catch (error) {
      throw new Error("runtime: HEIF decoder 无法初始化。", { cause: error });
    }
    const decoded = decoder.decodePrimary(new Uint8Array(await request.file.arrayBuffer()));
    const response: HeifWorkerResponse = { type: "decoded", id: request.id, ...decoded };
    worker.postMessage(response, [decoded.rgba]);
  } catch (error) {
    const response: HeifWorkerResponse = {
      type: "error",
      id: request.id,
      code: classifyHeifError(error),
      message: error instanceof Error ? error.message.replace(/^[^:]+:\s*/, "") : "HEIF 解码失败。",
    };
    worker.postMessage(response);
  }
});
