import { selectMessages, ViewerError, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { ResourceScope } from "@anyfile/viewer-rendering";
import { dicomManifest } from "./manifest";
import { messages } from "./messages";
import { createUI } from "./ui";
import { DicomViewport } from "./viewport";
import { DicomWorker } from "./worker-client";
import type { WindowSettings } from "./types";

export const dicomViewer: FileViewerPlugin = {
  manifest: dicomManifest,
  async open(context) {
    const { signal, locale, file, container } = context;
    const copy = selectMessages(locale, messages);
    const scope = new ResourceScope();
    let disposed = false;
    const dispose = () => { if (!disposed) { disposed = true; scope.dispose(); } };
    try {
      signal.throwIfAborted();
      if (typeof Worker === "undefined") throw new ViewerError("unsupported-environment", copy.environment);
      scope.listen(signal, "abort", dispose, { once: true });
      const worker = new DicomWorker(signal);
      scope.add(() => worker.dispose());
      context.reportProgress({ stage: "reading", message: copy.reading });
      const info = await worker.open(file);
      signal.throwIfAborted();
      const ui = createUI(info, copy);
      scope.add(() => ui.root.remove());
      container.append(ui.root);
      if (info.reason) {
        context.reportPreview?.({ outcome: "success", kind: "structure" });
        return { dispose };
      }
      const viewport = new DicomViewport(ui, info.width, info.height);
      scope.add(() => viewport.dispose());
      let busy = false;
      let displayed = 0;
      let currentWindow: WindowSettings | undefined;
      const controls = [ui.frame, ui.center, ui.width, ui.apply, ui.reset];
      const show = async (frame: number, window?: WindowSettings) => {
        busy = true;
        controls.forEach((control) => { control.disabled = true; });
        try {
          const result = await worker.frame(frame, window);
          if (disposed) return;
          viewport.setPixels(result.rgba);
          displayed = frame;
          ui.center.value = String(result.window.center);
          ui.width.value = String(result.window.width);
          ui.frame.value = String(frame + 1);
          ui.status.textContent = `${copy.displayed}: ${frame + 1} / ${info.frames}`;
        } finally {
          busy = false;
          if (!disposed) controls.forEach((control) => { control.disabled = false; });
        }
      };
      await show(0);
      signal.throwIfAborted();
      context.reportPreview?.({ outcome: "success", kind: "static" });
      const change = (frame: number, window?: WindowSettings) => {
        if (disposed || busy) return;
        ui.status.textContent = copy.loading;
        void show(frame, window).then(() => { if (!disposed) currentWindow = window; }).catch(() => {
          if (disposed) return;
          ui.frame.value = String(displayed + 1);
          ui.status.textContent = copy.frameError;
        });
      };
      scope.listen(ui.frame, "change", () => {
        const frame = ui.frame.valueAsNumber;
        if (!Number.isInteger(frame) || frame < 1 || frame > info.frames) { ui.frame.value = String(displayed + 1); return; }
        change(frame - 1, currentWindow);
      });
      scope.listen(ui.apply, "click", () => {
        const center = ui.center.valueAsNumber, width = ui.width.valueAsNumber;
        if (!Number.isFinite(center) || !Number.isFinite(width) || width < 1) { ui.status.textContent = copy.windowError; return; }
        change(displayed, { center, width });
      });
      scope.listen(ui.reset, "click", () => change(displayed));
      return { dispose };
    } catch (error) {
      dispose();
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw new DOMException("Aborted", "AbortError");
      const code = error instanceof ViewerError ? error.code : "invalid-file";
      throw new ViewerError(code, code === "resource-limit" ? copy.limit : code === "unsupported-environment" ? copy.environment : code === "invalid-file" ? copy.invalid : copy.failed, { cause: error });
    }
  },
};
