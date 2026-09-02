import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { GoProMaxInspection } from "./inspection";

export interface GoProMaxViewerElements {
  readonly root: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly reset: HTMLButtonElement;
  readonly play?: HTMLButtonElement;
  readonly seek?: HTMLInputElement;
  readonly volume?: HTMLInputElement;
  readonly time?: HTMLOutputElement;
  readonly status: HTMLSpanElement;
}

export function goProMaxUiCopy(locale: Locale) {
  return selectMessages(locale, {
    en: { tools: "GoPro MAX panorama tools", canvas: "360 degree panorama. Drag to look around, scroll to zoom, or use the arrow keys.", photo: "equirectangular photo", video: "dual-track EAC video", ready: "Ready", reset: "Reset view", play: "Play", pause: "Pause", replay: "Replay", seek: "Seek", volume: "Volume", playbackFailed: "Playback stopped because this browser could not continue decoding the video." },
    "zh-CN": { tools: "GoPro MAX 全景工具", canvas: "360 度全景。拖动环视、滚轮缩放，或使用方向键。", photo: "等距柱状全景照片", video: "双轨 EAC 全景视频", ready: "已就绪", reset: "重置视角", play: "播放", pause: "暂停", replay: "重播", seek: "定位", volume: "音量", playbackFailed: "浏览器无法继续解码，播放已停止。" },
  });
}

const styles = `
  .anyfile-gopro-max-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:#000; color:#fff; font-family:var(--viewer-font-family,system-ui,sans-serif); }
  .anyfile-gopro-max-viewer__toolbar { display:flex; min-height:48px; min-width:0; flex:none; align-items:center; gap:12px; overflow-x:auto; padding:8px 12px; border-bottom:1px solid color-mix(in srgb,var(--viewer-border,#ddd) 50%,transparent); background:color-mix(in srgb,var(--viewer-background,#fff) 92%,#000); color:var(--viewer-foreground,#111); font-size:13px; }
  .anyfile-gopro-max-viewer__identity { min-width:100px; margin-right:auto; overflow:hidden; }
  .anyfile-gopro-max-viewer__name { display:block; max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-gopro-max-viewer__meta { display:block; margin-top:2px; color:color-mix(in srgb,currentColor 62%,transparent); font-size:11px; white-space:nowrap; }
  .anyfile-gopro-max-viewer button { height:32px; border:1px solid var(--viewer-border,#aaa); border-radius:7px; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); padding:0 10px; font:inherit; white-space:nowrap; }
  .anyfile-gopro-max-viewer button:focus-visible, .anyfile-gopro-max-viewer input:focus-visible, .anyfile-gopro-max-viewer__viewport:focus-visible { outline:2px solid var(--viewer-accent,#60a5fa); outline-offset:2px; }
  .anyfile-gopro-max-viewer__viewport { position:relative; min-height:0; flex:1; overflow:hidden; touch-action:none; cursor:grab; user-select:none; }
  .anyfile-gopro-max-viewer__viewport[data-dragging=true] { cursor:grabbing; }
  .anyfile-gopro-max-viewer__canvas { display:block; width:100%; height:100%; }
  .anyfile-gopro-max-viewer__controls { display:flex; min-height:48px; flex:none; align-items:center; gap:10px; padding:8px 12px; border-top:1px solid #333; background:#111; }
  .anyfile-gopro-max-viewer__seek { min-width:80px; flex:1; }
  .anyfile-gopro-max-viewer__volume { width:96px; }
  .anyfile-gopro-max-viewer__time { min-width:92px; color:#ddd; font-size:12px; text-align:center; font-variant-numeric:tabular-nums; }
  .anyfile-gopro-max-viewer__status { min-width:0; overflow:hidden; color:#ddd; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-gopro-max-viewer__error { display:grid; height:100%; place-items:center; padding:24px; color:#fff; text-align:center; }
  @media (max-width:640px), (max-height:420px) {
    .anyfile-gopro-max-viewer__toolbar, .anyfile-gopro-max-viewer__controls { min-height:40px; padding:4px 8px; }
    .anyfile-gopro-max-viewer__meta, .anyfile-gopro-max-viewer__status, .anyfile-gopro-max-viewer__volume { display:none; }
    .anyfile-gopro-max-viewer__time { min-width:76px; }
  }
`;

export function createGoProMaxViewerElements(fileName: string, inspection: GoProMaxInspection, locale: Locale): GoProMaxViewerElements {
  const copy = goProMaxUiCopy(locale);
  const root = document.createElement("div");
  root.className = "anyfile-gopro-max-viewer";
  const style = document.createElement("style");
  style.textContent = styles;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-gopro-max-viewer__toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", copy.tools);
  const identity = document.createElement("div");
  identity.className = "anyfile-gopro-max-viewer__identity";
  const name = document.createElement("strong");
  name.className = "anyfile-gopro-max-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const metadata = document.createElement("span");
  metadata.className = "anyfile-gopro-max-viewer__meta";
  metadata.textContent = `${inspection.device} · ${inspection.width} × ${inspection.height} · ${inspection.kind === "photo" ? copy.photo : copy.video}`;
  identity.append(name, metadata);
  const status = document.createElement("span");
  status.className = "anyfile-gopro-max-viewer__status";
  status.setAttribute("role", "status");
  status.textContent = copy.ready;
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = copy.reset;
  reset.setAttribute("aria-label", copy.reset);
  toolbar.append(identity, status, reset);
  const viewport = document.createElement("div");
  viewport.className = "anyfile-gopro-max-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", copy.canvas);
  const canvas = document.createElement("canvas");
  canvas.className = "anyfile-gopro-max-viewer__canvas";
  viewport.append(canvas);
  root.append(style, toolbar, viewport);
  if (inspection.kind === "photo") return { root, viewport, canvas, reset, status };
  const controls = document.createElement("div");
  controls.className = "anyfile-gopro-max-viewer__controls";
  const play = document.createElement("button");
  play.type = "button";
  play.textContent = copy.play;
  play.setAttribute("aria-label", copy.play);
  const seek = document.createElement("input");
  seek.className = "anyfile-gopro-max-viewer__seek";
  seek.type = "range";
  seek.min = "0";
  seek.max = "0";
  seek.step = "0.01";
  seek.value = "0";
  seek.setAttribute("aria-label", copy.seek);
  const time = document.createElement("output");
  time.className = "anyfile-gopro-max-viewer__time";
  time.textContent = "0:00 / 0:00";
  const volume = document.createElement("input");
  volume.className = "anyfile-gopro-max-viewer__volume";
  volume.type = "range";
  volume.min = "0";
  volume.max = "1";
  volume.step = "0.05";
  volume.value = "1";
  volume.setAttribute("aria-label", copy.volume);
  controls.append(play, seek, time, volume);
  root.append(controls);
  return { root, viewport, canvas, reset, status, play, seek, volume, time };
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function showFatalError(elements: GoProMaxViewerElements, message: string) {
  elements.reset.disabled = true;
  const alert = document.createElement("div");
  alert.className = "anyfile-gopro-max-viewer__error";
  alert.setAttribute("role", "alert");
  alert.textContent = message;
  elements.viewport.replaceChildren(alert);
}
