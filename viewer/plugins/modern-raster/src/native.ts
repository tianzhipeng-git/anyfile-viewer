type DecoderTrack = { frameCount: number; repetitionCount: number };
type DecoderInstance = {
  tracks: { ready: Promise<void>; selectedTrack?: DecoderTrack | null };
  decode(options?: { frameIndex?: number; completeFramesOnly?: boolean }): Promise<{ image: VideoFrame }>;
  close(): void;
};
type ImageDecoderConstructor = {
  isTypeSupported(type: string): Promise<boolean>;
  new(options: { data: ReadableStream<Uint8Array>; type: string }): DecoderInstance;
};

let heicSupport: Promise<boolean> | undefined;

function decoderConstructor() {
  return (globalThis as typeof globalThis & { ImageDecoder?: ImageDecoderConstructor }).ImageDecoder;
}

export function canDecodeNativeHeic() {
  return heicSupport ??= decodeHeicCapabilitySample();
}

async function decodeHeicCapabilitySample() {
  const bytes = Uint8Array.from(atob(HEIC_CAPABILITY_SAMPLE), (value) => value.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/heic" });
  const Decoder = decoderConstructor();
  if (Decoder) {
    try {
      if (await Decoder.isTypeSupported("image/heic")) {
        const decoder = new Decoder({ data: blob.stream(), type: "image/heic" });
        try {
          await decoder.tracks.ready;
          const frame = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
          frame.image.close();
          return true;
        } finally {
          decoder.close();
        }
      }
    } catch { /* Try the browser image element path below. */ }
  }
  const image = await loadImage(blob);
  if (!image) return false;
  URL.revokeObjectURL(image.url);
  image.element.src = "";
  return true;
}

function loadImage(blob: Blob): Promise<{ element: HTMLImageElement; url: string } | undefined> {
  if (typeof Image === "undefined") return Promise.resolve(undefined);
  const url = URL.createObjectURL(blob);
  const element = new Image();
  return new Promise((resolve) => {
    element.onload = () => resolve({ element, url });
    element.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); };
    element.src = url;
  });
}

export class NativeImageSequence {
  private constructor(
    private readonly decoder: DecoderInstance | undefined,
    readonly frameCount: number,
    readonly loops: number,
    private readonly staticImage?: { element: HTMLImageElement; url: string },
  ) {}

  static async open(file: File, mimeTypes: readonly string[]) {
    const Decoder = decoderConstructor();
    if (Decoder) {
      let type: string | undefined;
      for (const candidate of mimeTypes) {
        if (await Decoder.isTypeSupported(candidate)) { type = candidate; break; }
      }
      if (type) {
        const decoder = new Decoder({ data: file.stream(), type });
        try {
          await decoder.tracks.ready;
          const track = decoder.tracks.selectedTrack;
          if (!track) throw new Error("ImageDecoder did not select an image track.");
          return new NativeImageSequence(decoder, Math.max(1, track.frameCount), track.repetitionCount);
        } catch (error) {
          decoder.close();
          throw error;
        }
      }
    }
    const staticImage = await loadImage(file);
    return staticImage ? new NativeImageSequence(undefined, 1, 0, staticImage) : undefined;
  }

  async render(frameIndex: number) {
    if (this.staticImage) return { bitmap: await createImageBitmap(this.staticImage.element), durationMs: 100 };
    const result = await this.decoder!.decode({ frameIndex, completeFramesOnly: true });
    try {
      const bitmap = await createImageBitmap(result.image);
      return { bitmap, durationMs: Math.max(16, (result.image.duration ?? 100_000) / 1000) };
    } finally {
      result.image.close();
    }
  }

  close() {
    this.decoder?.close();
    if (this.staticImage) { URL.revokeObjectURL(this.staticImage.url); this.staticImage.element.src = ""; }
  }
}
import { HEIC_CAPABILITY_SAMPLE } from "./heic-capability-sample";
