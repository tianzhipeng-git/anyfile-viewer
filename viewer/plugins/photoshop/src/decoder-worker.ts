/// <reference lib="webworker" />

import { decodePhotoshop } from "./decode";
import type { PhotoshopWorkerRequest, PhotoshopWorkerResponse } from "./types";

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.addEventListener("message", async (event: MessageEvent<PhotoshopWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "decode") return;
  try {
    const decoded = decodePhotoshop(await request.file.arrayBuffer());
    const response: PhotoshopWorkerResponse = { type: "decoded", id: request.id, ...decoded };
    worker.postMessage(response, [decoded.rgba.buffer]);
  } catch (error) {
    const response: PhotoshopWorkerResponse = {
      type: "error",
      id: request.id,
      code: error instanceof RangeError ? "resource-limit" : "invalid-file",
      message: error instanceof RangeError ? "Photoshop document exceeds the safe preview limit." : "Photoshop document could not be decoded.",
    };
    worker.postMessage(response);
  }
});
