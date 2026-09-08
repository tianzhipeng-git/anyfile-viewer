import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import { FFMPEG_LOCAL } from "./client";
import type { MediaInfo } from "./types";

export function messages(locale: Locale) {
  return selectMessages(locale, {
    en: { play: "Play", pause: "Pause", replay: "Replay", seek: "Playback position", volume: "Volume", loading: "Opening media…", buffering: "Buffering…", failed: "Unable to play this file.", invalid: "This media combination is not supported.", environment: "This browser could not initialize the media player.", limit: "This file exceeds the playback resource limits.", license: "Licenses and source", audio: "Audio", video: "Video" },
    "zh-CN": { play: "播放", pause: "暂停", replay: "重播", seek: "播放位置", volume: "音量", loading: "正在打开媒体…", buffering: "正在缓冲…", failed: "无法播放这个文件。", invalid: "不支持这个媒体组合。", environment: "当前浏览器无法初始化播放器。", limit: "此文件超出播放资源限制。", license: "许可证与源码", audio: "音频", video: "视频" },
  });
}
export type PlayerMessages = ReturnType<typeof messages>;
export function createElements(name: string, info: MediaInfo, copy: PlayerMessages) {
  const root = document.createElement("div"); root.className = `anyfile-ffmpeg-player anyfile-ffmpeg-${info.video ? "video" : "audio"}-viewer`;
  const style = document.createElement("style");
  style.textContent = `
.anyfile-ffmpeg-player{box-sizing:border-box;height:100%;min-height:0;width:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#111);font:13px var(--viewer-font-family,system-ui)}
.anyfile-ffmpeg-player__header{display:flex;gap:12px;padding:8px 12px;align-items:center;border-bottom:1px solid var(--viewer-border,#ddd)}
.anyfile-ffmpeg-player__name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.anyfile-ffmpeg-player__stage{min-height:0;flex:1;display:flex;justify-content:center;align-items:center;position:relative;overflow:hidden}
.anyfile-ffmpeg-player__canvas{max-width:100%;max-height:100%;object-fit:contain;display:block}
.anyfile-ffmpeg-player__controls{flex:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid var(--viewer-border,#ddd)}
.anyfile-ffmpeg-player__seek{flex:1;min-width:70px}.anyfile-ffmpeg-player__volume{width:70px}.anyfile-ffmpeg-player__time{font-variant-numeric:tabular-nums}
.anyfile-ffmpeg-player button{font:inherit;padding:5px 10px;color:inherit;background:var(--viewer-background,#fff);border:1px solid var(--viewer-border,#ddd);border-radius:5px;cursor:pointer}
.anyfile-ffmpeg-player button:focus-visible,.anyfile-ffmpeg-player input:focus-visible,.anyfile-ffmpeg-player a:focus-visible{outline:2px solid var(--viewer-accent,#2563eb);outline-offset:2px}
.anyfile-ffmpeg-player__status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;pointer-events:none}.anyfile-ffmpeg-player__status:empty{display:none}
.anyfile-ffmpeg-audio-viewer .anyfile-ffmpeg-player__stage{font-size:20px;color:var(--viewer-foreground,#111)}
@media(max-height:220px){.anyfile-ffmpeg-player__header{display:none}.anyfile-ffmpeg-player__controls{padding:4px}}
`;
  const header = document.createElement("div"); header.className = "anyfile-ffmpeg-player__header";
  const title = document.createElement("span"); title.className = "anyfile-ffmpeg-player__name"; title.textContent = name; title.title = name;
  const license = document.createElement("a"); license.href = `${FFMPEG_LOCAL}SOURCE.md`; license.textContent = copy.license; license.target = "_blank"; license.rel = "noopener noreferrer";
  header.append(title, license);
  const stage = document.createElement("div"); stage.className = "anyfile-ffmpeg-player__stage";
  const canvas = info.video ? document.createElement("canvas") : null;
  if (canvas) { canvas.width = info.width; canvas.height = info.height; canvas.className = "anyfile-ffmpeg-player__canvas"; canvas.setAttribute("aria-label", copy.video); stage.append(canvas); }
  else { const label = document.createElement("span"); label.textContent = `${info.audioCodec.toUpperCase()} · ${info.sampleRate} Hz · ${info.channels} ch`; stage.append(label); }
  const status = document.createElement("div"); status.className = "anyfile-ffmpeg-player__status"; status.setAttribute("role", "status"); stage.append(status);
  const controls = document.createElement("div"); controls.className = "anyfile-ffmpeg-player__controls";
  const play = document.createElement("button"); play.type = "button"; play.textContent = copy.play;
  const seek = document.createElement("input"); seek.type = "range"; seek.min = "0"; seek.max = String(info.duration); seek.step = "0.001"; seek.value = "0"; seek.className = "anyfile-ffmpeg-player__seek"; seek.setAttribute("aria-label", copy.seek);
  const time = document.createElement("span"); time.className = "anyfile-ffmpeg-player__time";
  const volume = document.createElement("input"); volume.type = "range"; volume.min = "0"; volume.max = "1"; volume.step = "0.01"; volume.value = "1"; volume.className = "anyfile-ffmpeg-player__volume"; volume.setAttribute("aria-label", copy.volume);
  controls.append(play, seek, time, volume); root.append(style, header, stage, controls);
  return { root, canvas, play, seek, time, volume, status };
}
export type PlayerElements = ReturnType<typeof createElements>;
export function updateTime(elements: PlayerElements, position: number, duration: number) {
  const format = (value: number) => `${Math.floor(Math.max(0, value) / 60)}:${Math.floor(Math.max(0, value) % 60).toString().padStart(2, "0")}`;
  elements.seek.value = String(Math.min(duration, Math.max(0, position)));
  elements.time.textContent = `${format(position)} / ${format(duration)}`;
}
