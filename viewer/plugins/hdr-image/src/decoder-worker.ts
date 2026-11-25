import { ViewerError } from "@anyfile/viewer-protocol";
import { ExrDocument } from "./exr-decoder";
import { isOpenExrHeader, isRadianceHdrHeader } from "./probe";
import { decodeRadianceHdr } from "./radiance-hdr";
import {
  MAX_HDR_INPUT_BYTES,
  type HdrDecodedFrame,
  type HdrWorkerRequest,
  type HdrWorkerResponse,
} from "./types";

let currentExr: ExrDocument | undefined;
let currentHdrFrame: HdrDecodedFrame | undefined;

async function handleOpen(file: File): Promise<HdrDecodedFrame> {
  currentExr = undefined;
  currentHdrFrame = undefined;

  if (file.size > MAX_HDR_INPUT_BYTES) {
    throw new ViewerError(
      "resource-limit",
      `HDR file size (${(file.size / (1024 * 1024)).toFixed(1)} MiB) exceeds the 256 MiB viewing budget.`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isOpenExrHeader(bytes)) {
    const doc = ExrDocument.parse(bytes);
    currentExr = doc;
    return doc.decodeLayer(0);
  }
  if (isRadianceHdrHeader(bytes)) {
    const frame = decodeRadianceHdr(bytes);
    currentHdrFrame = frame;
    return frame;
  }
  throw new ViewerError("invalid-file", "Unrecognized OpenEXR or Radiance HDR file.");
}

function handleSelect(partIndex: number, layerId: string): HdrDecodedFrame {
  if (currentExr) {
    return currentExr.decodeLayer(partIndex, layerId);
  }
  if (currentHdrFrame && partIndex === 0 && layerId === currentHdrFrame.layerId) {
    return {
      ...currentHdrFrame,
      rgba: currentHdrFrame.rgba.slice(),
    };
  }
  throw new ViewerError("open-failed", "No active HDR document is loaded in the decoder worker.");
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<HdrWorkerRequest>) => void) | null;
  postMessage: (message: HdrWorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = async (event: MessageEvent<HdrWorkerRequest>) => {
  const req = event.data;
  try {
    const frame = req.type === "open"
      ? await handleOpen(req.file)
      : handleSelect(req.partIndex, req.layerId);
    const buffer = frame.rgba.buffer;
    workerScope.postMessage({ id: req.id, type: "frame", frame }, [buffer]);
  } catch (error) {
    const viewerError = error instanceof ViewerError
      ? error
      : new ViewerError("open-failed", error instanceof Error ? error.message : "Failed to decode HDR image.");
    workerScope.postMessage({
      id: req.id,
      type: "error",
      code: viewerError.code,
      message: viewerError.message,
    });
  }
};
