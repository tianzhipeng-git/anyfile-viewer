import { MAX_RAW_SOURCE_BYTES, RawDecoder } from "@anyfile/raw-decoder";
import { ViewerError } from "@anyfile/viewer-protocol";

import { abortError, readBlob } from "./read-blob";

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

export async function decodeX3Dng(
  file: File,
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
  const bytes = await readBlob(file, signal);
  const decoder = new RawDecoder(signal);
  let developed: ImageBitmap | undefined;
  try {
    await decoder.open(bytes);
    const metadata = await decoder.metadata();
    if (metadata.make !== "Arashi Vision" || metadata.model !== "Insta360 X3" || metadata.width !== 2976 || metadata.height !== 5952) {
      throw new ViewerError("invalid-file", invalidMessage);
    }
    developed = await decoder.developed();
    if (developed.width !== 2976 || developed.height !== 5952) throw new ViewerError("invalid-file", invalidMessage);
    let first: ImageBitmap | undefined;
    try {
      first = await createBitmapAbortably(() => createImageBitmap(developed!, 0, 0, 2976, 2976), signal);
      const second = await createBitmapAbortably(() => createImageBitmap(developed!, 0, 2976, 2976, 2976), signal);
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
