import { ViewerError } from "@anyfile/viewer-protocol";

import { abortError } from "./read-blob";

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

export async function decodeGoProMaxPhoto(file: File, signal: AbortSignal, invalidMessage: string, unsupportedMessage: string) {
  if (typeof createImageBitmap !== "function") throw new ViewerError("unsupported-environment", unsupportedMessage);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createBitmapAbortably(() => createImageBitmap(file.slice(0, file.size, "image/jpeg")), signal);
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw new ViewerError("invalid-file", invalidMessage, { cause: error });
  }
  if (signal.aborted) {
    bitmap.close();
    throw abortError();
  }
  if (bitmap.width !== 5760 || bitmap.height !== 2880) {
    bitmap.close();
    throw new ViewerError("invalid-file", invalidMessage);
  }
  return bitmap;
}
