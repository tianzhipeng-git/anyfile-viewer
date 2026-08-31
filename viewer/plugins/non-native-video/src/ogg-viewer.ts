import { ViewerError, selectMessages, type OpenViewerContext, type ViewerController } from "@anyfile/viewer-protocol";

import { abortError } from "./abort-error";
import { inspectOgg } from "./ogg-probe";
import ogvRuntime from "../ogv-runtime.json";

const OGV_ROOT = `/vendor/ogv/${ogvRuntime.version}`;
const OGG_VALIDATION_BYTES = 512 * 1024;

interface OgvPlayerElement extends HTMLElement {
  src: string;
  duration: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  volume: number;
  videoWidth: number;
  videoHeight: number;
  error?: { message?: string } | null;
  play(): Promise<void> | void;
  pause(): void;
  load(): void;
}

interface OgvGlobal {
  OGVLoader: { base: string };
  OGVPlayer: new (options?: Record<string, unknown>) => OgvPlayerElement;
}

let runtimePromise: Promise<OgvGlobal> | undefined;

function loadRuntime(failedMessage: string) {
  if (runtimePromise) return runtimePromise;
  let script: HTMLScriptElement | undefined;
  const attempt = new Promise<OgvGlobal>((resolve, reject) => {
    const global = window as unknown as Partial<OgvGlobal>;
    if (global.OGVLoader && global.OGVPlayer) {
      global.OGVLoader.base = OGV_ROOT;
      resolve(global as OgvGlobal);
      return;
    }
    script = document.createElement("script");
    script.src = `${OGV_ROOT}/ogv.js`;
    script.async = true;
    script.onload = () => {
      if (!global.OGVLoader || !global.OGVPlayer) {
        reject(new Error("OGV.js did not expose its runtime."));
        return;
      }
      global.OGVLoader.base = OGV_ROOT;
      resolve(global as OgvGlobal);
    };
    script.onerror = () => reject(new Error("OGV.js runtime failed to load."));
    document.head.append(script);
  });
  const cached = attempt.catch((error) => {
    script?.remove();
    if (runtimePromise === cached) runtimePromise = undefined;
    throw new ViewerError("open-failed", failedMessage, { cause: error });
  });
  runtimePromise = cached;
  return cached;
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

function createUi(fileName: string, copy: { play: string; pause: string; replay: string; seek: string; volume: string }) {
  const root = document.createElement("div");
  root.className = "anyfile-non-native-video-viewer anyfile-non-native-video-viewer--ogg";
  root.innerHTML = `<style>
    .anyfile-non-native-video-viewer{box-sizing:border-box;display:flex;height:100%;min-height:0;width:100%;flex-direction:column;overflow:hidden;background:#000;color:#fff;font-family:var(--viewer-font-family,system-ui,sans-serif)}
    .anyfile-non-native-video-viewer__header{display:flex;min-width:0;flex:none;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--viewer-border,#333);padding:8px 12px;background:var(--viewer-background,#111);color:var(--viewer-foreground,#fff);font-size:13px}
    .anyfile-non-native-video-viewer__name,.anyfile-non-native-video-viewer__meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.anyfile-non-native-video-viewer__name{font-weight:600}.anyfile-non-native-video-viewer__meta{opacity:.68}
    .anyfile-non-native-video-viewer__stage{position:relative;display:flex;min-height:0;flex:1;align-items:center;justify-content:center;overflow:hidden}.anyfile-non-native-video-viewer__stage>div{max-height:100%;max-width:100%}
    .anyfile-non-native-video-viewer__controls{display:grid;grid-template-columns:auto minmax(80px,1fr) auto minmax(64px,120px);flex:none;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid #333;background:#111}
    .anyfile-non-native-video-viewer__button{min-width:64px;border:1px solid #555;border-radius:6px;padding:5px 10px;background:#222;color:#fff;cursor:pointer}.anyfile-non-native-video-viewer__range{min-width:0;width:100%;accent-color:var(--viewer-accent,#60a5fa)}
    .anyfile-non-native-video-viewer__time{min-width:78px;font-variant-numeric:tabular-nums;font-size:12px;text-align:center}@media(max-width:520px),(max-height:420px){.anyfile-non-native-video-viewer__meta,.anyfile-non-native-video-viewer__volume{display:none}.anyfile-non-native-video-viewer__controls{grid-template-columns:auto minmax(60px,1fr) auto}}
  </style>`;
  const header = document.createElement("div");
  header.className = "anyfile-non-native-video-viewer__header";
  const name = document.createElement("span");
  name.className = "anyfile-non-native-video-viewer__name";
  name.textContent = fileName;
  const meta = document.createElement("span");
  meta.className = "anyfile-non-native-video-viewer__meta";
  const stage = document.createElement("div");
  stage.className = "anyfile-non-native-video-viewer__stage";
  const controls = document.createElement("div");
  controls.className = "anyfile-non-native-video-viewer__controls";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "anyfile-non-native-video-viewer__button";
  button.textContent = copy.play;
  const seek = document.createElement("input");
  seek.type = "range"; seek.min = "0"; seek.step = "0.001"; seek.value = "0";
  seek.className = "anyfile-non-native-video-viewer__range";
  seek.setAttribute("aria-label", copy.seek);
  const time = document.createElement("span");
  time.className = "anyfile-non-native-video-viewer__time";
  const volume = document.createElement("input");
  volume.type = "range"; volume.min = "0"; volume.max = "1"; volume.step = "0.01"; volume.value = "1";
  volume.className = "anyfile-non-native-video-viewer__range anyfile-non-native-video-viewer__volume";
  volume.setAttribute("aria-label", copy.volume);
  header.append(name, meta); controls.append(button, seek, time, volume); root.append(header, stage, controls);
  return { root, stage, meta, button, seek, time, volume };
}

export async function openOggVideo(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, reportProgress, signal } = context;
  const copy = selectMessages(context.locale, { "zh-CN": {
    runtime: "Ogg 解码运行时加载失败，请重试。", unsupported: "当前浏览器缺少 Ogg 软件解码所需能力。",
    invalid: "文件不是受支持的 Ogg Theora 视频。", audioUnsupported: "当前浏览器缺少 Web Audio 能力。",
    loading: "正在加载 Ogg Theora 解码器…", decoding: "正在软件解码 Theora 首帧…", ready: "视频已打开", failed: "无法解码这个 Ogg Theora 视频。", play: "播放", pause: "暂停", replay: "重播", seek: "播放位置", volume: "音量",
  }, en: {
    runtime: "The Ogg decoding runtime failed to load. Try again.", unsupported: "This browser lacks capabilities required for software Ogg decoding.",
    invalid: "The file is not a supported Ogg Theora video.", audioUnsupported: "This browser does not provide Web Audio.",
    loading: "Loading the Ogg Theora decoder…", decoding: "Software-decoding the first Theora frame…", ready: "Video opened", failed: "Unable to decode this Ogg Theora video.", play: "Play", pause: "Pause", replay: "Replay", seek: "Playback position", volume: "Volume",
  } });
  if (typeof WebAssembly === "undefined" || typeof Worker === "undefined") {
    throw new ViewerError("unsupported-environment", copy.unsupported);
  }
  if (signal.aborted) throw abortError();
  const validationHead = new Uint8Array(await file.slice(0, OGG_VALIDATION_BYTES).arrayBuffer());
  if (signal.aborted) throw abortError();
  const inspection = inspectOgg(validationHead);
  if (!inspection) {
    throw new ViewerError("invalid-file", copy.invalid);
  }
  if (inspection.audioCodec && typeof AudioContext === "undefined") {
    throw new ViewerError("unsupported-environment", copy.audioUnsupported);
  }
  reportProgress({ stage: "reading", message: copy.loading, loaded: 0, total: file.size });
  const runtime = await loadRuntime(copy.runtime);
  if (signal.aborted) throw abortError();
  const ui = createUi(file.name, copy);
  const audioContext = inspection.audioCodec ? new AudioContext() : undefined;
  const player = new runtime.OGVPlayer({ wasm: true, worker: true, audioContext });
  player.setAttribute("aria-label", file.name);
  ui.stage.append(player);
  container.append(ui.root);
  const objectUrl = URL.createObjectURL(file);
  let disposed = false;
  const onAbort = () => void dispose();
  const update = () => {
    ui.seek.value = String(player.currentTime || 0);
    ui.time.textContent = `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
    ui.button.textContent = player.ended ? copy.replay : player.paused ? copy.play : copy.pause;
  };
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", onAbort);
    player.pause();
    player.src = "";
    await audioContext?.close();
    ui.root.remove();
    URL.revokeObjectURL(objectUrl);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    reportProgress({ stage: "decoding-first-frame", message: copy.decoding });
    await new Promise<void>((resolve, reject) => {
      const ready = () => resolve();
      const failed = () => reject(new Error(player.error?.message ?? "Ogg decode failed."));
      player.addEventListener("loadeddata", ready, { once: true });
      player.addEventListener("error", failed, { once: true });
      player.src = objectUrl;
    });
    if (signal.aborted) throw abortError();
    ui.seek.max = String(player.duration);
    ui.meta.textContent = `Ogg · THEORA · ${player.videoWidth} × ${player.videoHeight}`;
    update();
    ui.button.addEventListener("click", () => {
      if (player.ended) player.currentTime = 0;
      if (player.paused || player.ended) {
        if (audioContext) void audioContext.resume().then(() => player.play());
        else void player.play();
      } else player.pause();
      update();
    });
    ui.seek.addEventListener("input", () => { player.currentTime = Number(ui.seek.value); update(); });
    ui.volume.addEventListener("input", () => { player.volume = Number(ui.volume.value); });
    for (const event of ["timeupdate", "play", "pause", "ended"]) player.addEventListener(event, update);
    reportProgress({ stage: "ready", message: copy.ready });
    return { dispose };
  } catch (error) {
    await dispose();
    if (signal.aborted) throw abortError();
    throw new ViewerError("invalid-file", copy.failed, { cause: error });
  }
}
