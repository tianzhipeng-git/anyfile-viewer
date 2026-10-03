import { ViewerError } from "@anyfile/viewer-protocol";
import { openDicom, readFrame, type DicomSource } from "./decoder";
import type { WorkerRequest, WorkerResponse } from "./types";

let file: File | undefined;
let source: DicomSource | undefined;
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "open") {
      file = request.file;
      source = await openDicom(file);
      self.postMessage({ id: request.id, type: "info", info: source.info } satisfies WorkerResponse);
    } else {
      if (!file || !source) throw new ViewerError("invalid-file", "No DICOM source.");
      const result = await readFrame(file, source, request.frame, request.window);
      self.postMessage({ id: request.id, type: "frame", result } satisfies WorkerResponse, { transfer: [result.rgba.buffer] });
    }
  } catch (error) {
    self.postMessage({ id: request.id, type: "error", code: error instanceof ViewerError ? error.code : "invalid-file" } satisfies WorkerResponse);
  }
};
