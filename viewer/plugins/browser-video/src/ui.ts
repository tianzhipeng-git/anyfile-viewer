import type { VideoFileInspection } from "./types";

export interface VideoViewerElements {
  readonly root: HTMLDivElement;
  readonly video: HTMLVideoElement;
  readonly metadata: HTMLSpanElement;
}

function trackSummary(inspection: VideoFileInspection) {
  const video = inspection.videoTracks.map(({ codec }) => codec).join(" / ");
  const audio = inspection.audioTracks.length
    ? inspection.audioTracks.map(({ codec }) => codec).join(" / ")
    : "video-only";
  return `${inspection.container} · ${video} · ${audio}`;
}

export function createVideoViewerElements(
  fileName: string,
  inspection: VideoFileInspection,
): VideoViewerElements {
  const root = document.createElement("div");
  root.className = "anyfile-browser-video-viewer";

  const style = document.createElement("style");
  style.textContent = `
    .anyfile-browser-video-viewer {
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
    .anyfile-browser-video-viewer__toolbar {
      display: flex;
      min-width: 0;
      flex: none;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--viewer-border, #ddd);
      padding: 8px 12px;
      font-size: 13px;
    }
    .anyfile-browser-video-viewer__name,
    .anyfile-browser-video-viewer__metadata {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .anyfile-browser-video-viewer__name { font-weight: 600; }
    .anyfile-browser-video-viewer__metadata { color: color-mix(in srgb, currentColor 68%, transparent); }
    .anyfile-browser-video-viewer__content {
      display: flex;
      min-height: 0;
      flex: 1;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 12px;
      background: #000;
    }
    .anyfile-browser-video-viewer__video {
      display: block;
      max-height: 100%;
      max-width: 100%;
      height: auto;
      width: auto;
      object-fit: contain;
    }
    @media (max-width: 520px), (max-height: 420px) {
      .anyfile-browser-video-viewer__toolbar { padding: 5px 8px; }
      .anyfile-browser-video-viewer__metadata { display: none; }
      .anyfile-browser-video-viewer__content { padding: 0; }
      .anyfile-browser-video-viewer__video { width: 100%; }
    }
  `;

  const toolbar = document.createElement("div");
  toolbar.className = "anyfile-browser-video-viewer__toolbar";
  const name = document.createElement("span");
  name.className = "anyfile-browser-video-viewer__name";
  name.textContent = fileName;
  name.title = fileName;
  const metadata = document.createElement("span");
  metadata.className = "anyfile-browser-video-viewer__metadata";
  metadata.textContent = trackSummary(inspection);
  metadata.title = metadata.textContent;
  toolbar.append(name, metadata);

  const content = document.createElement("div");
  content.className = "anyfile-browser-video-viewer__content";
  const video = document.createElement("video");
  video.className = "anyfile-browser-video-viewer__video";
  video.controls = true;
  video.autoplay = false;
  video.preload = "metadata";
  video.playsInline = true;
  video.setAttribute("aria-label", fileName);
  content.append(video);
  root.append(style, toolbar, content);
  return { root, video, metadata };
}

export function updateVideoMetadata(
  metadata: HTMLSpanElement,
  inspection: VideoFileInspection,
  video: HTMLVideoElement,
) {
  const dimensions = video.videoWidth && video.videoHeight ? `${video.videoWidth} × ${video.videoHeight}` : undefined;
  const duration = Number.isFinite(video.duration) ? `${video.duration.toFixed(2)} s` : undefined;
  const parts = [trackSummary(inspection), dimensions, duration].filter(Boolean);
  metadata.textContent = parts.join(" · ");
  metadata.title = metadata.textContent;
}
