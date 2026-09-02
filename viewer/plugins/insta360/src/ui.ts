import { ResourceScope } from "@anyfile/viewer-rendering";
import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { Insta360Inspection } from "./inspection";

export interface Insta360ViewerElements {
  readonly root: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly reset: HTMLButtonElement;
  readonly video?: HTMLVideoElement;
  readonly secondVideo?: HTMLVideoElement;
  readonly play?: HTMLButtonElement;
  readonly seek?: HTMLInputElement;
  readonly volume?: HTMLInputElement;
  readonly time?: HTMLOutputElement;
  readonly status: HTMLSpanElement;
}

const styles = `
  .anyfile-insta360-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:#000; color:#fff; font-family:var(--viewer-font-family,system-ui,sans-serif); }
  .anyfile-insta360-viewer__toolbar { display:flex; min-height:48px; min-width:0; flex:none; align-items:center; gap:12px; overflow-x:auto; padding:8px 12px; border-bottom:1px solid color-mix(in srgb,var(--viewer-border,#ddd) 50%,transparent); background:color-mix(in srgb,var(--viewer-background,#fff) 92%,#000); color:var(--viewer-foreground,#111); font-size:13px; }
  .anyfile-insta360-viewer__identity { min-width:100px; margin-right:auto; overflow:hidden; }
  .anyfile-insta360-viewer__name { display:block; max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-insta360-viewer__meta { display:block; margin-top:2px; color:color-mix(in srgb,currentColor 62%,transparent); font-size:11px; white-space:nowrap; }
  .anyfile-insta360-viewer button { height:32px; border:1px solid var(--viewer-border,#aaa); border-radius:7px; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); padding:0 10px; font:inherit; white-space:nowrap; }
  .anyfile-insta360-viewer button:focus-visible, .anyfile-insta360-viewer input:focus-visible, .anyfile-insta360-viewer__viewport:focus-visible { outline:2px solid var(--viewer-accent,#60a5fa); outline-offset:2px; }
  .anyfile-insta360-viewer__viewport { position:relative; min-height:0; flex:1; overflow:hidden; touch-action:none; cursor:grab; user-select:none; }
  .anyfile-insta360-viewer__viewport[data-dragging=true] { cursor:grabbing; }
  .anyfile-insta360-viewer__canvas { display:block; width:100%; height:100%; }
  .anyfile-insta360-viewer__video { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
  .anyfile-insta360-viewer__controls { display:flex; min-height:48px; flex:none; align-items:center; gap:10px; padding:8px 12px; border-top:1px solid #333; background:#111; }
  .anyfile-insta360-viewer__seek { min-width:80px; flex:1; }
  .anyfile-insta360-viewer__volume { width:96px; }
  .anyfile-insta360-viewer__time { min-width:92px; color:#ddd; font-size:12px; text-align:center; font-variant-numeric:tabular-nums; }
  .anyfile-insta360-viewer__status { min-width:0; overflow:hidden; color:#ddd; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-insta360-viewer__status[data-kind=notice] { color:color-mix(in srgb,currentColor 72%,#f59e0b); font-weight:600; }
  .anyfile-insta360-viewer__error { display:grid; height:100%; place-items:center; padding:24px; color:#fff; text-align:center; }
  @media (max-width:640px), (max-height:420px) {
    .anyfile-insta360-viewer__toolbar, .anyfile-insta360-viewer__controls { min-height:40px; padding:4px 8px; }
    .anyfile-insta360-viewer__meta, .anyfile-insta360-viewer__status:not([data-kind=notice]), .anyfile-insta360-viewer__volume { display:none; }
    .anyfile-insta360-viewer__time { min-width:76px; }
  }
`;

export function insta360UiCopy(locale: Locale) {
  return selectMessages(locale, {
    en: { tools: "Panorama viewing tools", reset: "Reset view", canvas: "360 degree panorama; drag to look around and use the mouse wheel to zoom", photo: "X3 photo · side-by-side dual fisheye", raw: "RAW photo · dual fisheye", proxyVideo: "proxy video · side-by-side dual fisheye", pairedVideo: "HD video · paired dual fisheye files", dualTrackVideo: "HD video · two fisheye tracks in one file", play: "Play", pause: "Pause", replay: "Replay", seek: "Seek video", volume: "Volume", ready: "Ready", staticPreview: "HEVC is unsupported: showing the embedded stitched panorama frame", playbackFailed: "Playback could not start." },
    "zh-CN": { tools: "全景查看工具", reset: "重置视角", canvas: "360 度全景；拖动环视，使用滚轮缩放", photo: "X3 照片 · 左右双鱼眼", raw: "RAW 照片 · 双鱼眼", proxyVideo: "代理视频 · 左右双鱼眼", pairedVideo: "高清视频 · 双文件双鱼眼", dualTrackVideo: "高清视频 · 单文件双鱼眼双轨", play: "播放", pause: "暂停", replay: "重播", seek: "视频进度", volume: "音量", ready: "就绪", staticPreview: "不支持 HEVC：当前读取已拼接全景帧", playbackFailed: "无法开始播放。" },
  });
}

export type Insta360UiCopy = ReturnType<typeof insta360UiCopy>;

export function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${Math.floor(value / 60)}:${seconds}`;
}

export function createInsta360ViewerElements(
  fileName: string,
  inspection: Insta360Inspection,
  locale: Locale,
): Insta360ViewerElements {
  const copy = insta360UiCopy(locale);
  const root = document.createElement("div");
  root.className = "anyfile-insta360-viewer";
  const style = document.createElement("style");
  style.textContent = styles;
  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-insta360-viewer__toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", copy.tools);
  const identity = document.createElement("div");
  identity.className = "anyfile-insta360-viewer__identity";
  const name = document.createElement("strong");
  name.className = "anyfile-insta360-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const metadata = document.createElement("span");
  metadata.className = "anyfile-insta360-viewer__meta";
  const description = inspection.kind === "photo" ? copy.photo
    : inspection.kind === "raw" ? `${inspection.device} ${copy.raw}`
      : `${inspection.device} ${inspection.layout === "paired-files" ? copy.pairedVideo : inspection.layout === "dual-track" ? copy.dualTrackVideo : copy.proxyVideo}`;
  metadata.textContent = `${inspection.width} × ${inspection.height} · ${description}`;
  identity.append(name, metadata);
  const status = document.createElement("span");
  status.className = "anyfile-insta360-viewer__status";
  status.setAttribute("role", "status");
  status.textContent = copy.ready;
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = copy.reset;
  reset.setAttribute("aria-label", copy.reset);
  toolbar.append(identity, status, reset);

  const viewport = document.createElement("div");
  viewport.className = "anyfile-insta360-viewer__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", copy.canvas);
  const canvas = document.createElement("canvas");
  canvas.className = "anyfile-insta360-viewer__canvas";
  viewport.append(canvas);
  root.append(style, toolbar, viewport);
  if (inspection.kind === "photo" || inspection.kind === "raw") return { root, viewport, canvas, reset, status };

  let video: HTMLVideoElement | undefined;
  let secondVideo: HTMLVideoElement | undefined;
  if (inspection.layout !== "dual-track") {
    video = document.createElement("video");
    video.className = "anyfile-insta360-viewer__video";
    video.autoplay = false;
    video.controls = false;
    video.preload = "auto";
    video.playsInline = true;
  }
  if (inspection.layout === "paired-files" && video) {
    secondVideo = video.cloneNode() as HTMLVideoElement;
    secondVideo.muted = true;
    secondVideo.defaultMuted = true;
  }
  const controls = document.createElement("div");
  controls.className = "anyfile-insta360-viewer__controls";
  const play = document.createElement("button");
  play.type = "button";
  play.textContent = copy.play;
  play.setAttribute("aria-label", copy.play);
  const seek = document.createElement("input");
  seek.className = "anyfile-insta360-viewer__seek";
  seek.type = "range";
  seek.min = "0";
  seek.max = "0";
  seek.step = "0.01";
  seek.value = "0";
  seek.setAttribute("aria-label", copy.seek);
  const time = document.createElement("output");
  time.className = "anyfile-insta360-viewer__time";
  time.textContent = "0:00 / 0:00";
  const volume = document.createElement("input");
  volume.className = "anyfile-insta360-viewer__volume";
  volume.type = "range";
  volume.min = "0";
  volume.max = "1";
  volume.step = "0.05";
  volume.value = "1";
  volume.setAttribute("aria-label", copy.volume);
  if (video) viewport.append(video);
  if (secondVideo) viewport.append(secondVideo);
  controls.append(play, seek, time, volume);
  root.append(controls);
  return { root, viewport, canvas, reset, status, video, secondVideo, play, seek, volume, time };
}

export function bindVideoControls(elements: Insta360ViewerElements, locale: Locale) {
  const { video, secondVideo, play, seek, volume, time, viewport, status } = elements;
  if (!video || !play || !seek || !volume || !time) return () => undefined;
  const copy = insta360UiCopy(locale);
  const resources = new ResourceScope();
  const update = () => {
    const durations = [video.duration, secondVideo?.duration].filter((value): value is number => Number.isFinite(value));
    const duration = durations.length ? Math.min(...durations) : 0;
    if (secondVideo && !video.paused && video.currentTime >= duration) {
      video.pause();
      secondVideo.pause();
    }
    seek.max = String(duration);
    seek.value = String(Math.min(duration, video.currentTime || 0));
    time.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
    const ended = video.ended || secondVideo?.ended || duration > 0 && video.currentTime >= duration;
    const label = ended ? copy.replay : video.paused ? copy.play : copy.pause;
    play.textContent = label;
    play.setAttribute("aria-label", label);
  };
  const toggle = async () => {
    const duration = Math.min(video.duration, secondVideo?.duration ?? video.duration);
    if (!video.paused && !video.ended) {
      video.pause();
      secondVideo?.pause();
    }
    else {
      if (video.ended || secondVideo?.ended || video.currentTime >= duration) {
        video.currentTime = 0;
        if (secondVideo) secondVideo.currentTime = 0;
      }
      try {
        await Promise.all([video.play(), secondVideo?.play()]);
      } catch {
        video.pause();
        secondVideo?.pause();
        status.textContent = copy.playbackFailed;
      }
    }
    update();
  };
  resources.listen(play, "click", () => void toggle());
  resources.listen(seek, "input", () => {
    video.currentTime = Number(seek.value);
    if (secondVideo) secondVideo.currentTime = Number(seek.value);
  });
  resources.listen(volume, "input", () => { video.volume = Number(volume.value); });
  resources.listen(video, "loadedmetadata", update);
  resources.listen(video, "durationchange", update);
  resources.listen(video, "timeupdate", update);
  resources.listen(video, "play", update);
  resources.listen(video, "pause", update);
  resources.listen(video, "ended", update);
  if (secondVideo) {
    const synchronize = () => {
      if (video.paused) {
        secondVideo.pause();
        secondVideo.playbackRate = 1;
        return;
      }
      const drift = secondVideo.currentTime - video.currentTime;
      if (Math.abs(drift) > 0.18) {
        secondVideo.currentTime = video.currentTime;
        secondVideo.playbackRate = 1;
      } else if (Math.abs(drift) > 0.025) {
        secondVideo.playbackRate = drift > 0 ? 0.97 : 1.03;
      } else {
        secondVideo.playbackRate = 1;
      }
    };
    const interval = window.setInterval(synchronize, 100);
    resources.add(() => window.clearInterval(interval));
    resources.listen(video, "pause", synchronize);
    resources.listen(video, "seeked", synchronize);
    resources.listen(secondVideo, "timeupdate", update);
    resources.listen(secondVideo, "ended", () => {
      video.pause();
      update();
    });
  }
  resources.listen(viewport, "keydown", (event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key !== " ") return;
    keyboard.preventDefault();
    void toggle();
  });
  update();
  return () => resources.dispose();
}

export function showFatalError(elements: Insta360ViewerElements, message: string) {
  elements.video?.pause();
  elements.secondVideo?.pause();
  elements.reset.disabled = true;
  const alert = document.createElement("div");
  alert.className = "anyfile-insta360-viewer__error";
  alert.setAttribute("role", "alert");
  alert.textContent = message;
  elements.viewport.replaceChildren(alert);
}

export function showStaticPreview(elements: Insta360ViewerElements, locale: Locale) {
  const message = insta360UiCopy(locale).staticPreview;
  elements.status.dataset.kind = "notice";
  elements.status.textContent = message;
  elements.status.title = message;
  elements.play?.parentElement?.remove();
}
