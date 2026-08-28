import { abortError } from "./read-blob";

export async function decodeImage(
  image: HTMLImageElement,
  source: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw abortError();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => {
      image.removeAttribute("src");
      finish(abortError());
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error("Image decoding failed."));
    signal.addEventListener("abort", onAbort, { once: true });
    image.src = source;

    if (typeof image.decode === "function") {
      void image.decode().then(() => finish(), (error) => finish(error));
    }
  });

  if (signal.aborted) throw abortError();
}
