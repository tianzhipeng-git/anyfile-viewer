import type { AudioFileInspection } from "./types";

function summary(inspection: AudioFileInspection) {
  return [inspection.container, inspection.codec,
    inspection.sampleRate ? `${inspection.sampleRate} Hz` : undefined,
    inspection.channels ? `${inspection.channels} ch` : undefined].filter(Boolean).join(" · ");
}

export function createAudioViewerElements(fileName: string, inspection: AudioFileInspection, visualizerLabel: string) {
  const root = document.createElement("div");
  root.className = "anyfile-browser-audio-viewer";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-browser-audio-viewer{box-sizing:border-box;display:flex;height:100%;min-height:0;width:100%;flex-direction:column;overflow:hidden;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#111);font-family:var(--viewer-font-family,system-ui,sans-serif)}
    .anyfile-browser-audio-viewer__header{display:flex;min-width:0;flex:none;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--viewer-border,#ddd);padding:8px 12px;font-size:13px}
    .anyfile-browser-audio-viewer__name,.anyfile-browser-audio-viewer__meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.anyfile-browser-audio-viewer__name{font-weight:600}.anyfile-browser-audio-viewer__meta{opacity:.68}
    .anyfile-browser-audio-viewer__content{display:flex;min-height:0;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:38px;padding:20px}
    .anyfile-browser-audio-viewer__visualizer{display:block;flex:none;width:min(600px,100%);height:72px;color:var(--viewer-foreground,#111);cursor:pointer}
    .anyfile-browser-audio-viewer__visualizer:focus-visible{outline:2px solid var(--viewer-accent,#2563eb);outline-offset:2px}
    .anyfile-browser-audio-viewer__audio{display:block;width:min(640px,100%)}
    @media(max-width:520px),(max-height:300px){.anyfile-browser-audio-viewer__header{padding:5px 8px}.anyfile-browser-audio-viewer__meta{display:none}.anyfile-browser-audio-viewer__content{gap:8px;padding:8px}.anyfile-browser-audio-viewer__visualizer{display:none}}
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
  const visualizer = document.createElement("canvas");
  visualizer.className = "anyfile-browser-audio-viewer__visualizer";
  // AudioVisualizer cycles its effect on click and Enter/Space; focusability, the accessible
  // name and the pointer affordance stay here because the plugin owns this element and its CSS.
  visualizer.setAttribute("role", "button");
  visualizer.setAttribute("tabindex", "0");
  visualizer.setAttribute("aria-label", visualizerLabel);
  visualizer.title = visualizerLabel;
  const audio = document.createElement("audio");
  audio.className = "anyfile-browser-audio-viewer__audio";
  audio.controls = true;
  audio.autoplay = false;
  audio.preload = "metadata";
  audio.setAttribute("aria-label", fileName);
  content.append(visualizer, audio);
  root.append(style, header, content);
  return { root, audio, meta, visualizer };
}

export function updateAudioMetadata(meta: HTMLElement, inspection: AudioFileInspection, audio: HTMLAudioElement) {
  const duration = Number.isFinite(audio.duration) ? `${audio.duration.toFixed(2)} s` : undefined;
  meta.textContent = [summary(inspection), duration].filter(Boolean).join(" · ");
  meta.title = meta.textContent;
}
