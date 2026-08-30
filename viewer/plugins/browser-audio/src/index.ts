import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { abortError } from "./abort-error";
import { inspectBrowserAudioFile } from "./inspect";
import { browserAudioManifest } from "./manifest";
import { MediaLoadError, waitForAudioData } from "./media-load";
import { createAudioViewerElements, updateAudioMetadata } from "./ui";

function copyFor(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? {
    reading: "正在检查音频容器与编码…", loading: "正在使用浏览器加载音频…", ready: "音频已打开",
    invalid: "文件不是有效、完整且受支持的音频。", unsupported: "当前浏览器或系统不能播放这个音频组合。", failed: "浏览器无法加载这个音频。",
  } : {
    reading: "Inspecting the audio container and codec…", loading: "Loading the audio in the browser…", ready: "Audio opened",
    invalid: "The file is not valid, complete supported audio.", unsupported: "This browser or system cannot play this audio combination.", failed: "The browser could not load this audio.",
  };
}

async function openBrowserAudio(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = copyFor(context.locale);
  let objectUrl: string | undefined;
  let root: HTMLElement | undefined;
  let audio: HTMLAudioElement | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (audio) {
      try { audio.pause(); } catch { /* Detached test media may not implement pause. */ }
      audio.removeAttribute("src");
      try { audio.load(); } catch { /* Detached test media may not implement load. */ }
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
    root?.remove();
    root = undefined;
  };
  try {
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const inspection = await inspectBrowserAudioFile({ file, signal });
    if (!inspection) throw new ViewerError("invalid-file", copy.invalid);
    if (signal.aborted) throw abortError();
    reportProgress({ stage: "loading-media", message: copy.loading });
    const elements = createAudioViewerElements(file.name, inspection);
    root = elements.root;
    audio = elements.audio;
    container.append(root);
    objectUrl = URL.createObjectURL(file);
    signal.addEventListener("abort", dispose, { once: true });
    audio.src = objectUrl;
    const loading = waitForAudioData(audio, signal);
    audio.load();
    await loading;
    if (signal.aborted) throw abortError();
    updateAudioMetadata(elements.meta, inspection, audio);
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    if (error instanceof MediaLoadError) {
      const code = error.mediaCode === 4 ? "unsupported-environment" : error.mediaCode === 3 ? "invalid-file" : "open-failed";
      const message = code === "unsupported-environment" ? copy.unsupported : code === "invalid-file" ? copy.invalid : copy.failed;
      throw new ViewerError(code, message, { cause: error });
    }
    throw new ViewerError("open-failed", copy.failed, { cause: error });
  }
}

export const browserAudioViewer: FileViewerPlugin = { manifest: browserAudioManifest, open: openBrowserAudio };
export { browserAudioManifest } from "./manifest";
