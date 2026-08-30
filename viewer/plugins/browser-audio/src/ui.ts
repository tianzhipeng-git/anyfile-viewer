import type { AudioFileInspection } from "./types";

function summary(inspection: AudioFileInspection) {
  return [inspection.container, inspection.codec,
    inspection.sampleRate ? `${inspection.sampleRate} Hz` : undefined,
    inspection.channels ? `${inspection.channels} ch` : undefined].filter(Boolean).join(" · ");
}

export function createAudioViewerElements(fileName: string, inspection: AudioFileInspection) {
  const root = document.createElement("div");
  root.className = "anyfile-browser-audio-viewer";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-browser-audio-viewer{box-sizing:border-box;display:flex;height:100%;min-height:0;width:100%;flex-direction:column;overflow:hidden;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#111);font-family:var(--viewer-font-family,system-ui,sans-serif)}
    .anyfile-browser-audio-viewer__header{display:flex;min-width:0;flex:none;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--viewer-border,#ddd);padding:8px 12px;font-size:13px}
    .anyfile-browser-audio-viewer__name,.anyfile-browser-audio-viewer__meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.anyfile-browser-audio-viewer__name{font-weight:600}.anyfile-browser-audio-viewer__meta{opacity:.68}
    .anyfile-browser-audio-viewer__content{display:flex;min-height:0;flex:1;align-items:center;justify-content:center;padding:20px}.anyfile-browser-audio-viewer__audio{display:block;width:min(640px,100%)}
    @media(max-width:520px),(max-height:300px){.anyfile-browser-audio-viewer__header{padding:5px 8px}.anyfile-browser-audio-viewer__meta{display:none}.anyfile-browser-audio-viewer__content{padding:8px}}
  `;
  const header = document.createElement("div");
  header.className = "anyfile-browser-audio-viewer__header";
  const name = document.createElement("span");
  name.className = "anyfile-browser-audio-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const meta = document.createElement("span");
  meta.className = "anyfile-browser-audio-viewer__meta";
  meta.textContent = summary(inspection);
  meta.title = meta.textContent;
  header.append(name, meta);
  const content = document.createElement("div");
  content.className = "anyfile-browser-audio-viewer__content";
  const audio = document.createElement("audio");
  audio.className = "anyfile-browser-audio-viewer__audio";
  audio.controls = true;
  audio.autoplay = false;
  audio.preload = "metadata";
  audio.setAttribute("aria-label", fileName);
  content.append(audio);
  root.append(style, header, content);
  return { root, audio, meta };
}

export function updateAudioMetadata(meta: HTMLElement, inspection: AudioFileInspection, audio: HTMLAudioElement) {
  const duration = Number.isFinite(audio.duration) ? `${audio.duration.toFixed(2)} s` : undefined;
  meta.textContent = [summary(inspection), duration].filter(Boolean).join(" · ");
  meta.title = meta.textContent;
}
