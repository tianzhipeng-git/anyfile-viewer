import { ViewerError, type FileViewerPlugin, type OpenViewerContext, type ViewerController } from "@anyfile/viewer-protocol";
import { checkDimensions, MAX_JXL_FRAMES, MAX_MODERN_RASTER_SOURCE_BYTES } from "./limits";
import { modernRasterManifest } from "./manifest";
import { NativeImageSequence } from "./native";
import { inspectModernHeader } from "./probe-format";
import { abortError, readBlob } from "./read-blob";
import type { ModernRasterInfo } from "./types";
import { createModernRasterElements, updateModernMetadata, type ModernRasterElements } from "./ui";
import { ModernBitmapViewport } from "./viewport";
import { JxlDecoderWorker } from "./worker-client";

const PROBE_BYTES = 1024 * 1024;

function copyFor(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? {
    reading: "正在检查现代图片…", decoding: "正在解码图片…", ready: "图片已打开", invalid: "文件不是有效的 JPEG XL 或 HEIC 图片。", unsupported: "当前浏览器不能原生解码 HEIC。", primary: "仅主图像",
  } : {
    reading: "Inspecting modern image…", decoding: "Decoding image…", ready: "Image opened", invalid: "The file is not a valid JPEG XL or HEIC image.", unsupported: "This browser cannot decode HEIC natively.", primary: "primary image only",
  };
}

async function bitmapFromPng(png: Uint8Array) {
  const bytes = png.slice();
  return createImageBitmap(new Blob([bytes.buffer], { type: "image/png" }));
}

async function openModernRaster(context: OpenViewerContext): Promise<ViewerController> {
  const { file, signal, container, reportProgress } = context;
  const copy = copyFor(context.locale);
  let root: HTMLElement | undefined;
  let elements: ModernRasterElements | undefined;
  let viewport: ModernBitmapViewport | undefined;
  let worker: JxlDecoderWorker | undefined;
  let native: NativeImageSequence | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (timer !== undefined) clearTimeout(timer);
    native?.close(); worker?.dispose(); viewport?.dispose(); root?.remove();
    native = undefined; worker = undefined; viewport = undefined; root = undefined;
  };

  const animate = (frameCount: number, render: (index: number) => Promise<{ bitmap: ImageBitmap; durationMs: number }>) => {
    let frameIndex = 1;
    const next = async () => {
      if (disposed) return;
      try {
        const frame = await render(frameIndex);
        if (disposed) { frame.bitmap.close(); return; }
        viewport?.setBitmap(frame.bitmap);
        frameIndex = (frameIndex + 1) % frameCount;
        timer = setTimeout(() => void next(), frame.durationMs);
      } catch {
        if (elements && !disposed) elements.status.textContent = context.locale.startsWith("zh") ? "动画帧解码失败" : "Animation frame failed";
      }
    };
    timer = setTimeout(() => void next(), 0);
  };

  try {
    if (signal.aborted) throw abortError();
    if (file.size > MAX_MODERN_RASTER_SOURCE_BYTES) throw new ViewerError("resource-limit", "图片文件超过 256 MiB 输入上限。");
    reportProgress({ stage: "reading", message: copy.reading });
    const format = inspectModernHeader(await readBlob(file.slice(0, PROBE_BYTES), signal));
    if (!format) throw new ViewerError("invalid-file", copy.invalid);
    reportProgress({ stage: "decoding", message: copy.decoding });
    elements = createModernRasterElements(file.name, context.locale);
    root = elements.root;
    container.append(root);
    viewport = new ModernBitmapViewport(elements);

    let info: ModernRasterInfo;
    if (format === "HEIC") {
      native = await NativeImageSequence.open(file, ["image/heic", "image/heif"], false);
      if (!native) throw new ViewerError("unsupported-environment", copy.unsupported);
      const frame = await native.render(0);
      checkDimensions(frame.bitmap.width, frame.bitmap.height);
      viewport.setBitmap(frame.bitmap);
      info = { format: "HEIC", width: frame.bitmap.width, height: frame.bitmap.height, animated: false, frameCount: 1, loops: 0, note: copy.primary };
    } else {
      native = await NativeImageSequence.open(file, ["image/jxl"]);
      if (native) {
        if (native.frameCount > MAX_JXL_FRAMES) throw new ViewerError("resource-limit", "JPEG XL 动画超过 4096 帧上限。");
        const frame = await native.render(0);
        checkDimensions(frame.bitmap.width, frame.bitmap.height);
        viewport.setBitmap(frame.bitmap);
        info = { format: "JPEG XL", width: frame.bitmap.width, height: frame.bitmap.height, animated: native.frameCount > 1, frameCount: native.frameCount, loops: native.loops };
        if (native.frameCount > 1) animate(native.frameCount, async (index) => native!.render(index));
      } else {
        worker = new JxlDecoderWorker(signal);
        const opened = await worker.open(file);
        if (opened.type !== "opened") throw new ViewerError("open-failed", "JPEG XL Worker 返回了无效响应。");
        const bitmap = await bitmapFromPng(opened.png);
        viewport.setBitmap(bitmap);
        info = { format: "JPEG XL", width: opened.width, height: opened.height, animated: opened.frameCount > 1, frameCount: opened.frameCount, loops: opened.loops };
        if (opened.frameCount > 1) animate(opened.frameCount, async (index) => {
          const frame = await worker!.render(index);
          if (frame.type !== "frame") throw new Error("Invalid JXL frame response.");
          return { bitmap: await bitmapFromPng(frame.png), durationMs: frame.durationMs };
        });
      }
    }
    if (signal.aborted) throw abortError();
    updateModernMetadata(elements, info, context.locale);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const modernRasterViewer: FileViewerPlugin = { manifest: modernRasterManifest, open: openModernRaster };
export { modernRasterManifest } from "./manifest";
