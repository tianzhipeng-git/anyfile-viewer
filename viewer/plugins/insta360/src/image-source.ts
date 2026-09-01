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

export async function decodeX3Photo(
  file: File,
  signal: AbortSignal,
  invalidMessage: string,
  unsupportedMessage: string,
) {
  if (typeof createImageBitmap !== "function") {
    throw new ViewerError("unsupported-environment", unsupportedMessage);
  }
  const blob = file.slice(0, file.size, "image/jpeg");
  let image: ImageBitmap;
  try {
    image = await createBitmapAbortably(() => createImageBitmap(blob), signal);
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw new ViewerError("invalid-file", invalidMessage, { cause: error });
  }
  if (signal.aborted) {
    image.close();
    throw abortError();
  }
  if (image.width !== 5952 || image.height !== 2976) {
    image.close();
    throw new ViewerError("invalid-file", invalidMessage);
  }
  try {
    let first: ImageBitmap | undefined;
    try {
      first = await createBitmapAbortably(() => createImageBitmap(image, 0, 0, 2976, 2976), signal);
      const second = await createBitmapAbortably(() => createImageBitmap(image, 2976, 0, 2976, 2976), signal);
      return [first, second] as const;
    } catch (error) {
      first?.close();
      throw error;
    }
  } finally {
    image.close();
  }
}
