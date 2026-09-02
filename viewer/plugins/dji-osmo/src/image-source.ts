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

export async function decodeDjiOsmoPhoto(
  file: File,
  maximumWidth: number,
  signal: AbortSignal,
  invalidMessage: string,
  unsupportedMessage: string,
) {
  if (typeof createImageBitmap !== "function") throw new ViewerError("unsupported-environment", unsupportedMessage);
  const resizeWidth = Math.max(2, Math.floor(Math.min(8192, maximumWidth, 15520) / 2) * 2);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createBitmapAbortably(() => createImageBitmap(
      file.slice(0, file.size, "image/jpeg"),
      { resizeWidth, resizeHeight: resizeWidth / 2, resizeQuality: "high" },
    ), signal);
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw new ViewerError("invalid-file", invalidMessage, { cause: error });
  }
  if (signal.aborted) {
    bitmap.close();
    throw abortError();
  }
  if (bitmap.width !== resizeWidth || bitmap.height !== resizeWidth / 2) {
    bitmap.close();
    throw new ViewerError("invalid-file", invalidMessage);
  }
  return bitmap;
}
