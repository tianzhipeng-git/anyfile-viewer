import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { AudioDescription } from "./media-inspection";

export interface PlayerCopy { readonly play: string; readonly pause: string; readonly replay: string; readonly seek: string; readonly volume: string; readonly failed: string }
export interface PlayerElements { readonly root: HTMLDivElement; readonly play: HTMLButtonElement; readonly seek: HTMLInputElement; readonly time: HTMLSpanElement; readonly volume: HTMLInputElement; readonly status: HTMLDivElement }

export function playerCopy(locale: Locale): PlayerCopy {
  return selectMessages(locale, {
    en: { play: "Play", pause: "Pause", replay: "Replay", seek: "Playback position", volume: "Volume", failed: "A decoding error occurred during playback." },
    "zh-CN": { play: "播放", pause: "暂停", replay: "重播", seek: "播放位置", volume: "音量", failed: "播放过程中发生解码错误。" },
  });
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

export function updateTime(elements: PlayerElements, position: number, duration: number) {
  elements.seek.value = String(Math.min(duration, Math.max(0, position)));
  elements.time.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
}

export function createPlayerElements(fileName: string, media: AudioDescription, copy: PlayerCopy): PlayerElements {
  const root = document.createElement("div");
  root.className = "anyfile-non-native-audio-viewer";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-non-native-audio-viewer{box-sizing:border-box;display:flex;height:100%;min-height:0;width:100%;flex-direction:column;overflow:hidden;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#111);font-family:var(--viewer-font-family,system-ui,sans-serif)}
    .anyfile-non-native-audio-viewer__header{display:flex;min-width:0;flex:none;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--viewer-border,#ddd);padding:8px 12px;font-size:13px}.anyfile-non-native-audio-viewer__name,.anyfile-non-native-audio-viewer__meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.anyfile-non-native-audio-viewer__name{font-weight:600}.anyfile-non-native-audio-viewer__meta{opacity:.68}
    .anyfile-non-native-audio-viewer__stage{position:relative;display:flex;min-height:0;flex:1;align-items:center;justify-content:center;padding:20px}.anyfile-non-native-audio-viewer__glyph{font-size:72px;line-height:1}.anyfile-non-native-audio-viewer__status{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px;background:var(--viewer-background,#fff);text-align:center}.anyfile-non-native-audio-viewer__status[data-visible=true]{display:flex}
    .anyfile-non-native-audio-viewer__controls{display:grid;grid-template-columns:auto minmax(80px,1fr) auto minmax(64px,120px);flex:none;align-items:center;gap:10px;border-top:1px solid var(--viewer-border,#ddd);padding:8px 12px}.anyfile-non-native-audio-viewer__button{min-width:64px;border:1px solid var(--viewer-border,#aaa);border-radius:6px;padding:5px 10px;background:transparent;color:inherit;cursor:pointer}.anyfile-non-native-audio-viewer__range{min-width:0;width:100%;accent-color:var(--viewer-accent,#2563eb)}.anyfile-non-native-audio-viewer__time{min-width:78px;font-size:12px;text-align:center;font-variant-numeric:tabular-nums}.anyfile-non-native-audio-viewer__button:focus-visible,.anyfile-non-native-audio-viewer__range:focus-visible{outline:2px solid var(--viewer-accent,#2563eb);outline-offset:2px}
    @media(max-width:520px),(max-height:300px){.anyfile-non-native-audio-viewer__header{padding:5px 8px}.anyfile-non-native-audio-viewer__meta{display:none}.anyfile-non-native-audio-viewer__controls{grid-template-columns:auto minmax(44px,1fr) auto minmax(40px,64px);gap:6px;padding:6px 8px}.anyfile-non-native-audio-viewer__stage{padding:8px}.anyfile-non-native-audio-viewer__glyph{font-size:42px}}
  `;
  const header = document.createElement("div"); header.className = "anyfile-non-native-audio-viewer__header";
  const name = document.createElement("span"); name.className = "anyfile-non-native-audio-viewer__name"; name.textContent = fileName; name.title = fileName;
  const meta = document.createElement("span"); meta.className = "anyfile-non-native-audio-viewer__meta"; meta.textContent = `Matroska · ${media.codec.toUpperCase()} · ${media.sampleRate} Hz · ${media.channels} ch`; meta.title = meta.textContent; header.append(name, meta);
  const stage = document.createElement("div"); stage.className = "anyfile-non-native-audio-viewer__stage";
  const glyph = document.createElement("span"); glyph.className = "anyfile-non-native-audio-viewer__glyph"; glyph.textContent = "♫"; glyph.setAttribute("aria-hidden", "true");
  const status = document.createElement("div"); status.className = "anyfile-non-native-audio-viewer__status"; status.setAttribute("role", "alert"); stage.append(glyph, status);
  const controls = document.createElement("div"); controls.className = "anyfile-non-native-audio-viewer__controls";
  const play = document.createElement("button"); play.type = "button"; play.className = "anyfile-non-native-audio-viewer__button"; play.textContent = copy.play;
  const seek = document.createElement("input"); seek.type = "range"; seek.className = "anyfile-non-native-audio-viewer__range"; seek.min = String(media.startTimestamp); seek.max = String(media.duration); seek.step = "0.001"; seek.setAttribute("aria-label", copy.seek);
  const time = document.createElement("span"); time.className = "anyfile-non-native-audio-viewer__time";
  const volume = document.createElement("input"); volume.type = "range"; volume.className = "anyfile-non-native-audio-viewer__range anyfile-non-native-audio-viewer__volume"; volume.min = "0"; volume.max = "1"; volume.step = "0.01"; volume.value = "1"; volume.setAttribute("aria-label", copy.volume);
  controls.append(play, seek, time, volume); root.append(style, header, stage, controls);
  const elements = { root, play, seek, time, volume, status }; updateTime(elements, media.startTimestamp, media.duration); return elements;
}
