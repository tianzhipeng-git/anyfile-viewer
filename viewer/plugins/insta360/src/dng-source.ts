import { MAX_RAW_SOURCE_BYTES, RawDecoder } from "@anyfile/raw-decoder";
import { ViewerError } from "@anyfile/viewer-protocol";

import { abortError, readBlob } from "./read-blob";
import type { Insta360DngInspection } from "./dng-inspection";
import { decodeX6DeflateDng } from "./x6-dng-source";

function createBitmapAbortably(factory: () => Promise<ImageBitmap>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  const task = factory();
  return new Promise<ImageBitmap>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
      void task.then((bitmap) => bitmap.close(), () => undefined);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void task.then((bitmap) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(bitmap);
    }, (error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

export async function decodeInsta360Dng(
  file: File,
  inspection: Insta360DngInspection,
  signal: AbortSignal,
  invalidMessage: string,
  unsupportedMessage: string,
  tooLargeMessage: string,
  resourceMessage: string,
  failedMessage: string,
) {
  if (file.size > MAX_RAW_SOURCE_BYTES) throw new ViewerError("resource-limit", tooLargeMessage);
  if (globalThis.crossOriginIsolated !== true || typeof createImageBitmap !== "function") {
    throw new ViewerError("unsupported-environment", unsupportedMessage);
  }
  const bytes = inspection.device === "X6" ? undefined : await readBlob(file, signal);
  const decoder = new RawDecoder(signal);
  let developed: ImageBitmap | undefined;
  try {
    const halfSize = inspection.device === "X6";
    if (inspection.device === "X6") {
      developed = await decodeX6DeflateDng(file, signal, failedMessage);
    } else {
      await decoder.open(bytes!, { halfSize });
      const metadata = await decoder.metadata();
      if (metadata.make !== inspection.make || metadata.model !== inspection.model
        || metadata.width !== inspection.width || metadata.height !== inspection.height) {
        throw new ViewerError("invalid-file", invalidMessage);
      }
      developed = await decoder.developed();
    }
    const outputWidth = halfSize ? inspection.width / 2 : inspection.width;
    const outputHeight = halfSize ? inspection.height / 2 : inspection.height;
    const lensSize = halfSize ? inspection.lensSize / 2 : inspection.lensSize;
    if (developed.width !== outputWidth || developed.height !== outputHeight) throw new ViewerError("invalid-file", invalidMessage);
    let first: ImageBitmap | undefined;
    try {
      const secondX = inspection.layout === "sbs" ? lensSize : 0;
      const secondY = inspection.layout === "tb" ? lensSize : 0;
      first = await createBitmapAbortably(() => createImageBitmap(developed!, 0, 0, lensSize, lensSize), signal);
      const second = await createBitmapAbortably(() => createImageBitmap(developed!, secondX, secondY, lensSize, lensSize), signal);
      return [first, second] as const;
    } catch (error) {
      first?.close();
      throw error;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ViewerError) {
      const message = error.code === "invalid-file" ? invalidMessage
        : error.code === "unsupported-environment" ? unsupportedMessage
          : error.code === "resource-limit" ? resourceMessage
            : failedMessage;
      throw new ViewerError(error.code, message, { cause: error });
    }
    throw error;
  } finally {
    developed?.close();
    decoder.dispose();
  }
}
