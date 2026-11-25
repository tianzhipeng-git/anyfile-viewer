import {
  abortError,
  isViewerAbortError,
  normalizeViewerError,
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";
import {
  CanvasSurface,
  InteractiveViewport,
  ResourceScope,
  type ViewTransform,
} from "@anyfile/viewer-rendering";
import { hdrImageManifest } from "./manifest";
import { getHdrCopy } from "./messages";
import { HdriSphereViewport } from "./sphere-viewport";
import { DEFAULT_TONE_MAP, toneMapToRgba8 } from "./tone-map";
import type {
  ChannelInspectMode,
  HdrDecodedFrame,
  ToneMapOperator,
  ToneMapOptions,
} from "./types";
import { createHdrUi } from "./ui";
import { HdrDecoderWorkerClient, type HdrDecoderSession } from "./worker-client";

export type HdrSessionFactory = (signal: AbortSignal) => HdrDecoderSession;

export function createHdrImageViewer(
  createSession: HdrSessionFactory = (signal) => new HdrDecoderWorkerClient(signal),
): FileViewerPlugin {
  return {
    manifest: hdrImageManifest,

    async open(context: OpenViewerContext): Promise<ViewerController> {
      const { file, container, signal, locale, reportProgress, reportPreview } = context;
      if (signal.aborted) throw abortError();

      const copy = getHdrCopy(locale);
      const session = createSession(signal);
      let disposed = false;

      const safeReportProgress = (stage: string, message: string) => {
        if (!disposed && !signal.aborted) reportProgress({ stage, message });
      };

      safeReportProgress("decoding", copy.loading);

      let frame: HdrDecodedFrame;
      try {
        frame = await session.open(file);
        if (signal.aborted) throw abortError();
      } catch (error) {
        session.dispose();
        if (signal.aborted || isViewerAbortError(error)) throw abortError();
        throw normalizeViewerError(error, "Unable to decode this HDR / OpenEXR image.");
      }

      const ui = createHdrUi(copy);
      const resources = new ResourceScope();
      let toneMap: ToneMapOptions = { ...DEFAULT_TONE_MAP };
      let viewMode: "2d" | "360" = "2d";
      let transform: ViewTransform = { scale: 1, rotation: 0, panX: 0, panY: 0 };
      let sphere: HdriSphereViewport | undefined;
      let selectToken = 0;

      // Offscreen 8-bit tone-mapped image canvas (shared by 2D viewport & 360° sphere)
      const imageCanvas = document.createElement("canvas");
      imageCanvas.width = frame.width;
      imageCanvas.height = frame.height;
      const imageCtx = imageCanvas.getContext("2d");
      if (!imageCtx || !ui.canvas2d.getContext("2d")) {
        session.dispose();
        throw new ViewerError("unsupported-environment", "Canvas 2D is unavailable.");
      }

      let rgba8 = new Uint8ClampedArray(frame.width * frame.height * 4);

      const surface = new CanvasSurface(ui.canvas2d, ui.viewport, (ctx, w, h, dpr) => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.translate(w / 2 + transform.panX, h / 2 + transform.panY);
        ctx.rotate((transform.rotation * Math.PI) / 180);
        ctx.scale(transform.scale, transform.scale);
        ctx.drawImage(imageCanvas, -frame.width / 2, -frame.height / 2);
      });

      const viewport2d = new InteractiveViewport(ui, frame.width, frame.height, (next) => {
        transform = next;
        surface.schedule();
      });

      const renderToneMapped = () => {
        if (disposed) return;
        const expectedLen = frame.width * frame.height * 4;
        if (rgba8.length !== expectedLen) {
          rgba8 = new Uint8ClampedArray(expectedLen);
        }
        if (imageCanvas.width !== frame.width || imageCanvas.height !== frame.height) {
          imageCanvas.width = frame.width;
          imageCanvas.height = frame.height;
        }
        toneMapToRgba8(frame.rgba, rgba8, toneMap);
        const imageData = new ImageData(new Uint8ClampedArray(rgba8), frame.width, frame.height);
        imageCtx.putImageData(imageData, 0, 0);
        surface.schedule();
        if (sphere && viewMode === "360") {
          sphere.uploadCanvas(imageCanvas);
        }
      };

      const syncControlsFromToneMap = () => {
        ui.exposureInput.value = String(toneMap.exposure);
        ui.exposureOutput.textContent = `${toneMap.exposure >= 0 ? "+" : ""}${toneMap.exposure.toFixed(1)}`;
        ui.gammaInput.value = String(toneMap.gamma);
        ui.gammaOutput.textContent = toneMap.gamma.toFixed(2);
        ui.tmSelect.value = toneMap.operator;
        ui.channelSelect.value = toneMap.channelMode;
      };

      const setViewMode = (mode: "2d" | "360") => {
        if (mode === "360") {
          if (!sphere) {
            try {
              sphere = new HdriSphereViewport(ui.canvas360, ui.sphereViewport, (fov) => {
                ui.fovOutput.textContent = `${Math.round(fov)}°`;
              });
            } catch {
              ui.status.textContent = copy.webglUnavailable;
              viewMode = "2d";
              return;
            }
          }
          viewMode = "360";
          ui.viewport.hidden = true;
          ui.sphereViewport.hidden = false;
          ui.nav2dGroup.hidden = true;
          ui.nav360Group.hidden = false;
          ui.view2dBtn.setAttribute("aria-pressed", "false");
          ui.view360Btn.setAttribute("aria-pressed", "true");
          sphere.uploadCanvas(imageCanvas);
        } else {
          viewMode = "2d";
          ui.sphereViewport.hidden = true;
          ui.viewport.hidden = false;
          ui.nav360Group.hidden = true;
          ui.nav2dGroup.hidden = false;
          ui.view2dBtn.setAttribute("aria-pressed", "true");
          ui.view360Btn.setAttribute("aria-pressed", "false");
          surface.schedule();
        }
      };

      const loadSelection = async (partIndex: number, layerId: string) => {
        const token = ++selectToken;
        ui.partSelect.disabled = true;
        ui.layerSelect.disabled = true;
        ui.status.textContent = copy.switchingLayer;
        try {
          const nextFrame = await session.select(partIndex, layerId);
          if (disposed || signal.aborted || token !== selectToken) return;
          const resized = nextFrame.width !== frame.width || nextFrame.height !== frame.height;
          frame = nextFrame;
          ui.updateFrameSelectorsAndMetadata(frame);
          if (!frame.hasAlpha && toneMap.channelMode === "a") {
            toneMap = { ...toneMap, channelMode: "rgb" };
            syncControlsFromToneMap();
          }
          if (resized) {
            viewport2d.setContentSize(frame.width, frame.height);
          }
          renderToneMapped();
          ui.status.textContent = copy.pixelHint;
        } catch (error) {
          if (!disposed && !signal.aborted && !isViewerAbortError(error)) {
            ui.status.textContent = error instanceof Error ? error.message : "Failed to switch layer.";
          }
        } finally {
          if (!disposed) {
            ui.partSelect.disabled = false;
            ui.layerSelect.disabled = false;
          }
        }
      };

      // Wire UI events
      resources.listen(ui.view2dBtn, "click", () => setViewMode("2d"));
      resources.listen(ui.view360Btn, "click", () => setViewMode("360"));
      resources.listen(ui.resetCameraBtn, "click", () => sphere?.resetCamera());

      resources.listen(ui.partSelect, "change", () => {
        const nextPart = Number.parseInt(ui.partSelect.value, 10);
        const firstLayer = frame.parts[nextPart]?.layers[0]?.id ?? "beauty";
        void loadSelection(nextPart, firstLayer);
      });

      resources.listen(ui.layerSelect, "change", () => {
        void loadSelection(frame.partIndex, ui.layerSelect.value);
      });

      resources.listen(ui.channelSelect, "change", () => {
        toneMap = { ...toneMap, channelMode: ui.channelSelect.value as ChannelInspectMode };
        renderToneMapped();
      });

      resources.listen(ui.tmSelect, "change", () => {
        toneMap = { ...toneMap, operator: ui.tmSelect.value as ToneMapOperator };
        renderToneMapped();
      });

      resources.listen(ui.exposureInput, "input", () => {
        const val = Number.parseFloat(ui.exposureInput.value);
        toneMap = { ...toneMap, exposure: Number.isFinite(val) ? val : 0 };
        ui.exposureOutput.textContent = `${toneMap.exposure >= 0 ? "+" : ""}${toneMap.exposure.toFixed(1)}`;
        renderToneMapped();
      });

      resources.listen(ui.gammaInput, "input", () => {
        const val = Number.parseFloat(ui.gammaInput.value);
        toneMap = { ...toneMap, gamma: Number.isFinite(val) ? val : 2.2 };
        ui.gammaOutput.textContent = toneMap.gamma.toFixed(2);
        renderToneMapped();
      });

      resources.listen(ui.autoEvBtn, "click", () => {
        toneMap = { ...toneMap, exposure: frame.dynamicRange.suggestedExposure };
        syncControlsFromToneMap();
        renderToneMapped();
      });

      resources.listen(ui.resetGradingBtn, "click", () => {
        toneMap = { ...DEFAULT_TONE_MAP };
        syncControlsFromToneMap();
        renderToneMapped();
      });

      // Live linear float32 HDR pixel inspector on 2D hover
      resources.listen(ui.viewport, "pointermove", (event) => {
        const pe = event as PointerEvent;
        if (viewMode !== "2d" || ui.viewport.dataset.dragging === "true") return;
        const rect = ui.viewport.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const dx = pe.clientX - rect.left - rect.width / 2 - transform.panX;
        const dy = pe.clientY - rect.top - rect.height / 2 - transform.panY;
        const rad = (-transform.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const ix = (dx * cos - dy * sin) / transform.scale + frame.width / 2;
        const iy = (dx * sin + dy * cos) / transform.scale + frame.height / 2;
        const px = Math.floor(ix);
        const py = Math.floor(iy);
        if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) return;
        const idx = (py * frame.width + px) * 4;
        const r = frame.rgba[idx];
        const g = frame.rgba[idx + 1];
        const b = frame.rgba[idx + 2];
        const a = frame.rgba[idx + 3];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : String(n));
        ui.status.textContent = frame.hasAlpha
          ? `(${px}, ${py})  R=${fmt(r)}  G=${fmt(g)}  B=${fmt(b)}  A=${fmt(a)}  Y=${fmt(lum)}`
          : `(${px}, ${py})  R=${fmt(r)}  G=${fmt(g)}  B=${fmt(b)}  Y=${fmt(lum)}`;
      });

      ui.updateFrameSelectorsAndMetadata(frame);
      syncControlsFromToneMap();
      container.replaceChildren(ui.root);
      renderToneMapped();

      const dispose = () => {
        if (disposed) return;
        disposed = true;
        resources.dispose();
        viewport2d.dispose();
        surface.dispose();
        sphere?.dispose();
        sphere = undefined;
        session.dispose();
        imageCanvas.width = 0;
        imageCanvas.height = 0;
        if (ui.root.parentNode === container) {
          container.removeChild(ui.root);
        }
      };

      resources.listen(signal, "abort", dispose, { once: true });

      reportPreview?.({ outcome: "success", kind: "static" });
      return { dispose };
    },
  };
}

export const hdrImageViewer: FileViewerPlugin = createHdrImageViewer();
