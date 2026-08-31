import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { MediaDescription } from "./media-inspection";

export interface PlayerElements {
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly playButton: HTMLButtonElement;
  readonly seek: HTMLInputElement;
  readonly time: HTMLSpanElement;
  readonly volume: HTMLInputElement;
  readonly status: HTMLDivElement;
}

export interface PlayerCopy {
  readonly play: string;
  readonly pause: string;
  readonly replay: string;
  readonly volume: string;
  readonly seek: string;
  readonly failed: string;
}

export function playerCopy(locale: Locale): PlayerCopy {
  return selectMessages(locale, { "zh-CN": {
    play: "播放",
    pause: "暂停",
    replay: "重播",
    volume: "音量",
    seek: "播放位置",
    failed: "播放过程中发生解码错误。",
  }, en: {
    play: "Play",
    pause: "Pause",
    replay: "Replay",
    volume: "Volume",
    seek: "Playback position",
    failed: "A decoding error occurred during playback.",
  } });
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function updateTime(elements: PlayerElements, position: number, duration: number) {
  elements.seek.value = String(Math.min(duration, Math.max(0, position)));
  elements.time.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
}

export function createPlayerElements(
  fileName: string,
  media: MediaDescription,
  copy: PlayerCopy,
): PlayerElements {
  const root = document.createElement("div");
  root.className = "anyfile-non-native-video-viewer";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-non-native-video-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:#000; color:#fff; font-family:var(--viewer-font-family,system-ui,sans-serif) }
    .anyfile-non-native-video-viewer__header { display:flex; min-width:0; flex:none; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid var(--viewer-border,#333); padding:8px 12px; background:var(--viewer-background,#111); color:var(--viewer-foreground,#fff); font-size:13px }
    .anyfile-non-native-video-viewer__name,.anyfile-non-native-video-viewer__meta { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
    .anyfile-non-native-video-viewer__name { font-weight:600 }.anyfile-non-native-video-viewer__meta { opacity:.68 }
    .anyfile-non-native-video-viewer__stage { position:relative; display:flex; min-height:0; flex:1; align-items:center; justify-content:center; overflow:hidden }
    .anyfile-non-native-video-viewer__canvas { display:block; max-height:100%; max-width:100%; height:auto; width:auto; object-fit:contain }
    .anyfile-non-native-video-viewer__status { position:absolute; inset:0; display:none; align-items:center; justify-content:center; padding:24px; background:rgba(0,0,0,.82); color:#fff; text-align:center }
    .anyfile-non-native-video-viewer__status[data-visible="true"] { display:flex }
    .anyfile-non-native-video-viewer__controls { display:grid; grid-template-columns:auto minmax(80px,1fr) auto minmax(64px,120px); flex:none; align-items:center; gap:10px; padding:8px 12px; border-top:1px solid #333; background:#111 }
    .anyfile-non-native-video-viewer__button { min-width:64px; border:1px solid #555; border-radius:6px; padding:5px 10px; background:#222; color:#fff; cursor:pointer }
    .anyfile-non-native-video-viewer__button:focus-visible,.anyfile-non-native-video-viewer__range:focus-visible { outline:2px solid var(--viewer-accent,#60a5fa); outline-offset:2px }
    .anyfile-non-native-video-viewer__time { min-width:78px; font-variant-numeric:tabular-nums; font-size:12px; text-align:center }
    .anyfile-non-native-video-viewer__range { min-width:0; width:100%; accent-color:var(--viewer-accent,#60a5fa) }
    @media(max-width:520px),(max-height:420px){.anyfile-non-native-video-viewer__header{padding:5px 8px}.anyfile-non-native-video-viewer__meta{display:none}.anyfile-non-native-video-viewer__controls{grid-template-columns:auto minmax(60px,1fr) auto;padding:6px 8px}.anyfile-non-native-video-viewer__volume{display:none}}
  `;
  const header = document.createElement("div");
  header.className = "anyfile-non-native-video-viewer__header";
  const name = document.createElement("span");
  name.className = "anyfile-non-native-video-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const meta = document.createElement("span");
  meta.className = "anyfile-non-native-video-viewer__meta";
  meta.textContent = `${media.container} · ${media.videoCodec.toUpperCase()} · ${media.audioCodec?.toUpperCase() ?? "video-only"} · ${media.width} × ${media.height}`;
  meta.title = meta.textContent;
  header.append(name, meta);

  const stage = document.createElement("div");
  stage.className = "anyfile-non-native-video-viewer__stage";
  const canvas = document.createElement("canvas");
  canvas.className = "anyfile-non-native-video-viewer__canvas";
  canvas.width = media.width;
  canvas.height = media.height;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", fileName);
  const status = document.createElement("div");
  status.className = "anyfile-non-native-video-viewer__status";
  status.setAttribute("role", "alert");
  stage.append(canvas, status);

  const controls = document.createElement("div");
  controls.className = "anyfile-non-native-video-viewer__controls";
  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "anyfile-non-native-video-viewer__button";
  playButton.textContent = copy.play;
  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "anyfile-non-native-video-viewer__range";
  seek.min = String(media.startTimestamp);
  seek.max = String(media.duration);
  seek.step = "0.001";
  seek.setAttribute("aria-label", copy.seek);
  const time = document.createElement("span");
  time.className = "anyfile-non-native-video-viewer__time";
  const volume = document.createElement("input");
  volume.type = "range";
  volume.className = "anyfile-non-native-video-viewer__range anyfile-non-native-video-viewer__volume";
  volume.min = "0";
  volume.max = "1";
  volume.step = "0.01";
  volume.value = "1";
  volume.setAttribute("aria-label", copy.volume);
  controls.append(playButton, seek, time, volume);
  root.append(style, header, stage, controls);
  const elements = { root, canvas, playButton, seek, time, volume, status };
  updateTime(elements, media.startTimestamp, media.duration);
  return elements;
}
