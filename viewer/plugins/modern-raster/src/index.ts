import { ViewerError, type FileViewerPlugin, type OpenViewerContext, type ViewerController } from "@anyfile/viewer-protocol";
import { HeifDecoderWorker } from "./heif-worker-client";
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
    reading: "正在检查现代图片…", decoding: "正在解码图片…", ready: "图片已打开", invalid: "文件不是有效的 JPEG XL 或 HEIC 图片。", primary: "仅主图像", native: "原生解码", wasm: "WASM 回退", colorUnknown: "颜色空间未知", icc: "ICC 未应用", hdr: "HDR 已降为 SDR",
  } : {
    reading: "Inspecting modern image…", decoding: "Decoding image…", ready: "Image opened", invalid: "The file is not a valid JPEG XL or HEIC image.", primary: "primary image only", native: "native decode", wasm: "WASM fallback", colorUnknown: "unknown color space", icc: "ICC not applied", hdr: "HDR mapped to SDR",
  };
}

async function bitmapFromPng(png: Uint8Array) {
  const bytes = png.slice();
  return createImageBitmap(new Blob([bytes.buffer], { type: "image/png" }));
}

function bitmapFromRgba(rgba: ArrayBuffer, width: number, height: number) {
  return createImageBitmap(new ImageData(new Uint8ClampedArray(rgba), width, height, { colorSpace: "srgb" }));
}

async function openModernRaster(context: OpenViewerContext): Promise<ViewerController> {
  const { file, signal, container, reportProgress } = context;
  const copy = copyFor(context.locale);
  let root: HTMLElement | undefined;
  let elements: ModernRasterElements | undefined;
  let viewport: ModernBitmapViewport | undefined;
  let worker: JxlDecoderWorker | undefined;
  let heifWorker: HeifDecoderWorker | undefined;
  let native: NativeImageSequence | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (timer !== undefined) clearTimeout(timer);
    native?.close(); worker?.dispose(); heifWorker?.dispose(); viewport?.dispose(); root?.remove();
    native = undefined; worker = undefined; heifWorker = undefined; viewport = undefined; root = undefined;
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
    const format = inspectModernHeader(await readBlob(file.slice(0, PROBE_BYTES), signal), file.size);
    if (!format) throw new ViewerError("invalid-file", copy.invalid);
    reportProgress({ stage: "decoding", message: copy.decoding });
    elements = createModernRasterElements(file.name, context.locale);
    root = elements.root;
    container.append(root);
    viewport = new ModernBitmapViewport(elements);

    let info: ModernRasterInfo;
    if (format === "HEIC") {
      let nativeFrame: Awaited<ReturnType<NativeImageSequence["render"]>> | undefined;
      try {
        native = await NativeImageSequence.open(file, ["image/heic", "image/heif"], false);
        nativeFrame = await native?.render(0);
      } catch {
        native?.close();
        native = undefined;
      }
      if (nativeFrame) {
        checkDimensions(nativeFrame.bitmap.width, nativeFrame.bitmap.height);
        viewport.setBitmap(nativeFrame.bitmap);
        info = { format: "HEIC", width: nativeFrame.bitmap.width, height: nativeFrame.bitmap.height, animated: false, frameCount: 1, loops: 0, note: `${copy.primary} · ${copy.native}` };
      } else {
        heifWorker = new HeifDecoderWorker(signal);
        const decoded = await heifWorker.decode(file);
        checkDimensions(decoded.width, decoded.height);
        viewport.setBitmap(await bitmapFromRgba(decoded.rgba, decoded.width, decoded.height));
        const notes = [copy.primary, copy.wasm, decoded.color === "unknown" ? copy.colorUnknown : decoded.color];
        if (!decoded.iccApplied && decoded.color === "unknown") notes.push(copy.icc);
        if (decoded.hdrToSdr) notes.push(copy.hdr);
        info = { format: "HEIC", width: decoded.width, height: decoded.height, animated: false, frameCount: 1, loops: 0, note: notes.join(" · ") };
      }
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
