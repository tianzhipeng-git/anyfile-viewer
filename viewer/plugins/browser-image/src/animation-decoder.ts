import { ViewerError, type Locale } from "@anyfile/viewer-protocol";
import { inspectImageFile, type ImageFileInfo } from "./format";
import { abortError, readBlob } from "./read-blob";
import { animationCopy } from "./animation-ui";

// ImageDecoder is not yet included in TypeScript's DOM library.
export interface FrameDecoder {
  readonly tracks: { readonly ready: Promise<void>; readonly selectedTrack: { readonly animated: boolean; readonly frameCount: number; readonly repetitionCount: number } | null };
  readonly completed: Promise<void>;
  decode(options: { frameIndex: number; completeFramesOnly: boolean }): Promise<{ image: VideoFrame }>;
  close(): void;
}
interface DecoderConstructor {
  new(options: { data: Uint8Array<ArrayBuffer>; type: string; preferAnimation: boolean }): FrameDecoder;
  isTypeSupported(type: string): Promise<boolean>;
}
export function imageDecoder() {
  return (globalThis as typeof globalThis & { ImageDecoder?: DecoderConstructor }).ImageDecoder;
}
export function animationMime(info: ImageFileInfo) {
  return ({ GIF: "image/gif", PNG: "image/png", APNG: "image/png", WebP: "image/webp", AVIF: "image/avif" } as Partial<Record<ImageFileInfo["format"], string>>)[info.format];
}

export async function openAnimationDecoder(file: File, type: string, signal: AbortSignal, locale: Locale) {
  const copy = animationCopy(locale);
  const Decoder = imageDecoder();
  if (!Decoder) throw new ViewerError("unsupported-environment", copy.unavailable);
  if (file.size > 128 * 1024 ** 2) throw new ViewerError("resource-limit", copy.limit);
  const bytes = await readBlob(file, signal);
  const info = inspectImageFile(bytes, true);
  if (!info) throw new ViewerError("invalid-file", copy.invalid);
  // Budget the decoder's opaque frame cache as well as the output canvas before decoding.
  const pixels = (info.width ?? 0) * (info.height ?? 0);
  if (!pixels) throw new ViewerError("unsupported-environment", copy.dimensions);
  if (pixels > 16 * 1024 ** 2 || info.width! > 8192 || info.height! > 8192) throw new ViewerError("resource-limit", copy.limit);
  const decoder = new Decoder({ data: bytes as Uint8Array<ArrayBuffer>, type, preferAnimation: true });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", close);
    decoder.close();
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    // Observe both promises immediately: close() can reject either one during cancellation.
    await Promise.all([decoder.tracks.ready, decoder.completed]);
    if (signal.aborted) throw abortError();
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount < 1) throw new ViewerError("invalid-file", copy.invalid);
    if (track.frameCount > 10000 || pixels * track.frameCount > 64 * 1024 ** 2) throw new ViewerError("resource-limit", copy.limit);
    return { decoder, track, info, close };
  } catch (error) {
    close();
    if (signal.aborted) throw abortError();
    throw error;
  }
}
