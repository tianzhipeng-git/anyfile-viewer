import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { AudioDescription } from "./media-inspection";

export interface PlayerCopy {
  readonly play: string;
  readonly pause: string;
  readonly replay: string;
  readonly seek: string;
  readonly volume: string;
  readonly failed: string;
}

export interface PlayerElements {
  readonly root: HTMLDivElement;
  readonly play: HTMLButtonElement;
  readonly seek: HTMLInputElement;
  readonly currentTime: HTMLSpanElement;
  readonly duration: HTMLSpanElement;
  readonly volume: HTMLInputElement;
  readonly status: HTMLDivElement;
}

export function playerCopy(locale: Locale): PlayerCopy {
  return selectMessages(locale, {
    en: {
      play: "Play",
      pause: "Pause",
      replay: "Replay",
      seek: "Playback position",
      volume: "Volume",
      failed: "A decoding error occurred during playback.",
    },
    "zh-CN": {
      play: "播放",
      pause: "暂停",
      replay: "重播",
      seek: "播放位置",
      volume: "音量",
      failed: "播放过程中发生解码错误。",
    },
  });
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function updateSeekTrack(seek: HTMLInputElement) {
  const min = Number(seek.min);
  const max = Number(seek.max);
  const value = Number(seek.value);
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  seek.style.background = `linear-gradient(to right, var(--viewer-accent, #2563eb) 0%, var(--viewer-accent, #2563eb) ${percent}%, var(--viewer-border, #ddd) ${percent}%, var(--viewer-border, #ddd) 100%)`;
}

export function updateTime(elements: PlayerElements, position: number, duration: number) {
  const clamped = Math.min(duration, Math.max(0, position));
  elements.seek.value = String(clamped);
  elements.currentTime.textContent = formatTime(clamped);
  elements.duration.textContent = formatTime(duration);
  updateSeekTrack(elements.seek);
}

function svgIcon(className: string, paths: Array<{ d: string; fill?: string; stroke?: string; strokeWidth?: string }>) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  for (const path of paths) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", path.d);
    if (path.fill) el.setAttribute("fill", path.fill);
    if (path.stroke) {
      el.setAttribute("stroke", path.stroke);
      el.setAttribute("stroke-width", path.strokeWidth ?? "1.5");
      el.setAttribute("stroke-linecap", "round");
      el.setAttribute("fill", "none");
    }
    svg.append(el);
  }
  return svg;
}

export function createPlayerElements(fileName: string, media: AudioDescription, copy: PlayerCopy): PlayerElements {
  const root = document.createElement("div");
  root.className = "anyfile-non-native-audio-viewer";

  const style = document.createElement("style");
  style.textContent = `
    .anyfile-non-native-audio-viewer {
      box-sizing: border-box;
      display: flex;
      height: 100%;
      min-height: 0;
      width: 100%;
      flex-direction: column;
      overflow: hidden;
      background: var(--viewer-background, #fff);
      color: var(--viewer-foreground, #111);
      font-family: var(--viewer-font-family, system-ui, sans-serif);
    }

    .anyfile-non-native-audio-viewer__header {
      display: flex;
      min-width: 0;
      flex: none;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--viewer-border, #ddd);
      padding: 8px 12px;
      font-size: 13px;
    }

    .anyfile-non-native-audio-viewer__name,
    .anyfile-non-native-audio-viewer__meta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .anyfile-non-native-audio-viewer__name { font-weight: 600; }
    .anyfile-non-native-audio-viewer__meta { opacity: 0.68; }

    .anyfile-non-native-audio-viewer__stage {
      position: relative;
      display: flex;
      min-height: 0;
      flex: 1;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .anyfile-non-native-audio-viewer__status {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: color-mix(in srgb, var(--viewer-background, #fff) 92%, transparent);
      text-align: center;
      font-size: 14px;
      z-index: 1;
    }

    .anyfile-non-native-audio-viewer__status[data-visible="true"] { display: flex; }

    .anyfile-non-native-audio-viewer__controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
      width: 100%;
      max-width: 640px;
      padding: 10px 14px;
      border: 1px solid var(--viewer-border, #ddd);
      border-radius: 14px;
      background: var(--viewer-background, #fff);
      background: linear-gradient(
        to bottom,
        color-mix(in srgb, var(--viewer-background, #fff) 96%, var(--viewer-foreground, #111) 4%),
        color-mix(in srgb, var(--viewer-background, #fff) 90%, var(--viewer-foreground, #111) 10%)
      );
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
    }

    .anyfile-non-native-audio-viewer__play {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      flex: none;
      border: 1px solid var(--viewer-border, #aaa);
      border-radius: 50%;
      background: var(--viewer-background, #fff);
      color: var(--viewer-foreground, #111);
      cursor: pointer;
      padding: 0;
    }

    .anyfile-non-native-audio-viewer__play:hover {
      background: color-mix(in srgb, var(--viewer-background, #fff) 90%, var(--viewer-foreground, #111) 10%);
    }

    .anyfile-non-native-audio-viewer__play svg { display: none; }
    .anyfile-non-native-audio-viewer__play[data-state="play"] .anyfile-non-native-audio-viewer__icon-play { display: block; }
    .anyfile-non-native-audio-viewer__play[data-state="pause"] .anyfile-non-native-audio-viewer__icon-pause { display: block; }
    .anyfile-non-native-audio-viewer__play[data-state="replay"] .anyfile-non-native-audio-viewer__icon-replay { display: block; }

    .anyfile-non-native-audio-viewer__time {
      flex: none;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      opacity: 0.7;
      min-width: 32px;
      text-align: center;
    }

    .anyfile-non-native-audio-viewer__seek {
      flex: 1;
      min-width: 0;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--viewer-border, #ddd);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }

    .anyfile-non-native-audio-viewer__seek::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--viewer-accent, #2563eb);
      cursor: pointer;
      border: none;
    }

    .anyfile-non-native-audio-viewer__seek::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--viewer-accent, #2563eb);
      cursor: pointer;
      border: none;
    }

    .anyfile-non-native-audio-viewer__volume-icon {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      opacity: 0.7;
      color: var(--viewer-foreground, #111);
    }

    .anyfile-non-native-audio-viewer__volume {
      flex: none;
      width: 80px;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--viewer-border, #ddd);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }

    .anyfile-non-native-audio-viewer__volume::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--viewer-foreground, #111);
      cursor: pointer;
      border: none;
      opacity: 0.7;
    }

    .anyfile-non-native-audio-viewer__volume::-moz-range-thumb {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--viewer-foreground, #111);
      cursor: pointer;
      border: none;
      opacity: 0.7;
    }

    .anyfile-non-native-audio-viewer__play:focus-visible,
    .anyfile-non-native-audio-viewer__seek:focus-visible,
    .anyfile-non-native-audio-viewer__volume:focus-visible {
      outline: 2px solid var(--viewer-accent, #2563eb);
      outline-offset: 2px;
    }

    @media (max-width: 520px), (max-height: 300px) {
      .anyfile-non-native-audio-viewer__header { padding: 5px 8px; }
      .anyfile-non-native-audio-viewer__meta { display: none; }
      .anyfile-non-native-audio-viewer__stage { padding: 12px; }
      .anyfile-non-native-audio-viewer__controls { padding: 8px 10px; gap: 6px; border-radius: 10px; }
      .anyfile-non-native-audio-viewer__volume,
      .anyfile-non-native-audio-viewer__volume-icon { display: none; }
      .anyfile-non-native-audio-viewer__time { font-size: 10px; min-width: 28px; }
    }
  `;

  const header = document.createElement("div");
  header.className = "anyfile-non-native-audio-viewer__header";

  const name = document.createElement("span");
  name.className = "anyfile-non-native-audio-viewer__name";
  name.textContent = fileName;
  name.title = fileName;

  const meta = document.createElement("span");
  meta.className = "anyfile-non-native-audio-viewer__meta";
  meta.textContent = `Matroska · ${media.codec.toUpperCase()} · ${media.sampleRate} Hz · ${media.channels} ch`;
  meta.title = meta.textContent;

  header.append(name, meta);

  const stage = document.createElement("div");
  stage.className = "anyfile-non-native-audio-viewer__stage";

  const status = document.createElement("div");
  status.className = "anyfile-non-native-audio-viewer__status";
  status.setAttribute("role", "alert");

  const controls = document.createElement("div");
  controls.className = "anyfile-non-native-audio-viewer__controls";

  const play = document.createElement("button");
  play.type = "button";
  play.className = "anyfile-non-native-audio-viewer__play";
  play.dataset.state = "play";
  play.setAttribute("aria-label", copy.play);
  play.append(
    svgIcon("anyfile-non-native-audio-viewer__icon-play", [{ d: "M4 2 L14 8 L4 14 Z", fill: "currentColor" }]),
    svgIcon("anyfile-non-native-audio-viewer__icon-pause", [
      { d: "M4 2 H7 V14 H4 Z", fill: "currentColor" },
      { d: "M9 2 H12 V14 H9 Z", fill: "currentColor" },
    ]),
    svgIcon("anyfile-non-native-audio-viewer__icon-replay", [
      { d: "M8 3 A5 5 0 1 1 3 8", stroke: "currentColor" },
      { d: "M8 3 L6 1 M8 3 L10 1", stroke: "currentColor" },
    ]),
  );

  const currentTime = document.createElement("span");
  currentTime.className = "anyfile-non-native-audio-viewer__time";

  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "anyfile-non-native-audio-viewer__seek";
  seek.min = String(media.startTimestamp);
  seek.max = String(media.duration);
  seek.step = "0.001";
  seek.setAttribute("aria-label", copy.seek);

  const duration = document.createElement("span");
  duration.className = "anyfile-non-native-audio-viewer__time";

  const volumeIcon = svgIcon("anyfile-non-native-audio-viewer__volume-icon", [
    { d: "M8 2 L11 5 H13 V11 H11 L8 14 Z", fill: "currentColor" },
    { d: "M3 6 H5 V10 H3 Z", fill: "currentColor" },
  ]);

  const volume = document.createElement("input");
  volume.type = "range";
  volume.className = "anyfile-non-native-audio-viewer__volume";
  volume.min = "0";
  volume.max = "1";
  volume.step = "0.01";
  volume.value = "1";
  volume.setAttribute("aria-label", copy.volume);

  controls.append(play, currentTime, seek, duration, volumeIcon, volume);
  stage.append(status, controls);
  root.append(style, header, stage);

  const elements = { root, play, seek, currentTime, duration, volume, status };
  updateTime(elements, media.startTimestamp, media.duration);
  return elements;
}
