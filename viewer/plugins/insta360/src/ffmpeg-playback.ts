import { ViewerError, selectMessages, type Locale } from "@anyfile/viewer-protocol";
import { initializeFfmpeg, type FfmpegClient, type DecodedFrame, type MediaInfo } from "@anyfile/ffmpeg-playback/client";
import type { PanoramaRenderer } from "./panorama-renderer";
import type { PanoramaProjectionProfile } from "./projection";
import { PanoramaFrameQueue } from "./ffmpeg-queue";
import { formatTime, type Insta360ViewerElements } from "./ui";

const BUFFER_SECONDS = 0.5;
const PREFETCH_SECONDS = 0.7;
const PREVIEW_SECONDS = 0.1;
const copyFor = (locale: Locale) => selectMessages(locale, { "zh-CN": {
  play: "播放", pause: "暂停", replay: "重播", buffering: "正在缓冲全景视频…", failed: "全景视频播放失败。", limit: "当前设备无法在资源限制内解码此全景视频。",
  software: "FFmpeg 软件解码 · 每路 1920×1920 预览；播放速度取决于设备性能。",
}, en: {
  play: "Play", pause: "Pause", replay: "Replay", buffering: "Buffering panorama…", failed: "Panorama playback failed.", limit: "This device cannot decode the panorama within the resource limits.",
  software: "FFmpeg software decoding · 1920×1920 per lens; playback speed depends on your device.",
} });

export class FfmpegPanoramaPlayback {
  #queue: PanoramaFrameQueue;
  #context?: AudioContext;
  #gain?: GainNode;
  #sources = new Set<AudioBufferSourceNode>();
  #scheduled = new WeakSet<DecodedFrame>();
  #position = 0;
  #duration: number;
  #clockMedia = 0;
  #clockWall = 0;
  #wanted = false;
  #playing = false;
  #eof = false;
  #disposed = false;
  #failed = false;
  #generation = 0;
  #pump: Promise<void> = Promise.resolve();
  #transition?: Promise<void>;
  #animation?: number;
  #delay?: { timer: ReturnType<typeof setTimeout>; resolve: () => void };
  #drawn?: readonly [DecodedFrame, DecodedFrame];
  #remove: Array<() => void> = [];
  #close?: Promise<void>;
  readonly #copy;

  private constructor(readonly client: FfmpegClient, readonly info: MediaInfo, readonly renderer: PanoramaRenderer,
    readonly projection: PanoramaProjectionProfile, readonly elements: Insta360ViewerElements, locale: Locale) {
    this.#duration = info.duration;
    this.#queue = new PanoramaFrameQueue(info.duration, info.sampleRate, info.channels);
    this.#copy = copyFor(locale);
  }
  static async open(file: File, renderer: PanoramaRenderer, projection: PanoramaProjectionProfile,
    elements: Insta360ViewerElements, locale: Locale, signal: AbortSignal) {
    if (typeof VideoFrame === "undefined" || typeof AudioContext === "undefined" || typeof Worker === "undefined") {
      throw new ViewerError("unsupported-environment", "VideoFrame, Web Audio and Worker are required.");
    }
    const client = await initializeFfmpeg(signal);
    let session: FfmpegPanoramaPlayback | undefined;
    try {
      const info = await client.openPanorama(file);
      signal.throwIfAborted();
      if (info.videoCodec !== "hevc" || info.audioCodec !== "aac" || info.width !== 1920 || info.height !== 1920
        || !Number.isFinite(info.duration) || info.duration <= 0 || !info.audio) throw new ViewerError("invalid-file", "Unexpected panorama tracks.");
      session = new FfmpegPanoramaPlayback(client, info, renderer, projection, elements, locale);
      session.listen(signal, "abort", () => { void session?.dispose(); });
      await session.prime(0, 0, PREVIEW_SECONDS);
      signal.throwIfAborted();
      session.drawFirst();
      session.bind(); session.update();
      elements.status.dataset.kind = "notice";
      elements.status.title = session.#copy.software;
      elements.status.textContent = session.#copy.software;
      return session;
    } catch (error) {
      client.dispose(); await session?.dispose(); signal.throwIfAborted(); throw error;
    }
  }
  private listen(target: EventTarget, name: string, callback: EventListener) {
    target.addEventListener(name, callback); this.#remove.push(() => target.removeEventListener(name, callback));
  }
  private bind() {
    const { play, seek, volume, viewport } = this.elements;
    if (!play || !seek || !volume) throw new ViewerError("open-failed", "Missing video controls.");
    this.listen(play, "click", () => this.toggle());
    this.listen(seek, "input", () => this.seek(Number(seek.value)));
    this.listen(volume, "input", () => { if (this.#gain) this.#gain.gain.value = Number(volume.value); });
    this.listen(viewport, "keydown", event => {
      if ((event as KeyboardEvent).key === " ") { event.preventDefault(); this.toggle(); }
    });
  }
  private toggle() {
    if (this.#wanted) this.pause();
    else void this.play().catch(error => this.fail(error));
  }
  private async play() {
    if (this.#disposed || this.#failed || this.#wanted) return;
    this.#wanted = true;
    if (!this.#context) {
      this.#context = new AudioContext({ latencyHint: "playback", sampleRate: this.info.sampleRate });
      this.#gain = this.#context.createGain();
      this.#gain.gain.value = Number(this.elements.volume!.value);
      this.#gain.connect(this.#context.destination);
    }
    await this.#context.resume();
    if (this.#disposed || !this.#wanted) return;
    if (this.#context.state !== "running") throw new ViewerError("unsupported-environment", "Audio context did not resume.");
    if (this.#position >= this.#duration - 0.001) this.#position = 0;
    this.restart();
  }
  private pause() {
    this.stopClock(); this.#wanted = false; this.#generation++;
    this.elements.status.textContent = this.#copy.software; this.update();
  }
  private seek(position: number) {
    if (this.#disposed || this.#failed || !Number.isFinite(position)) return;
    this.stopClock(); this.#position = Math.max(0, Math.min(this.#duration, position)); this.restart();
  }
  private restart() {
    this.stopClock(); this.#generation++; this.update();
    this.elements.status.textContent = this.#copy.buffering;
    if (this.#transition) return;
    this.#transition = this.reconcile().catch(error => this.fail(error)).finally(() => { this.#transition = undefined; });
  }
  private async reconcile() {
    while (!this.#disposed && !this.#failed) {
      const generation = this.#generation, position = this.#position;
      await this.#pump;
      if (this.#disposed) return;
      if (generation !== this.#generation) continue;
      if (position >= this.#duration - 0.001) {
        this.#wanted = false; this.update(); this.elements.status.textContent = this.#copy.software; return;
      }
      await this.client.seek(position);
      if (this.#disposed) return;
      if (generation !== this.#generation) continue;
      this.#queue = new PanoramaFrameQueue(this.info.duration, this.info.sampleRate, this.info.channels);
      this.#eof = false;
      await this.prime(position, generation, this.#wanted ? BUFFER_SECONDS : PREVIEW_SECONDS);
      if (this.#disposed) return;
      if (generation !== this.#generation) continue;
      this.drawFirst();
      if (!this.#wanted) { this.elements.status.textContent = this.#copy.software; this.update(); return; }
      this.startClock();
      this.#pump = this.decode(generation).catch(error => { if (generation === this.#generation) this.fail(error); });
      this.tick(); return;
    }
  }
  private async pull(position: number, generation: number) {
    const frame = await this.client.next();
    if (this.#disposed || generation !== this.#generation) return;
    if (frame.kind === "eof") {
      this.#eof = true; this.#duration = Math.min(this.info.duration, this.#queue.end); return;
    }
    if (frame.timestamp + frame.duration > position) this.#queue.push(frame);
  }
  private async prime(position: number, generation: number, seconds: number) {
    for (let count = 0; count < 8192 && !this.#disposed && generation === this.#generation; count++) {
      await this.pull(position, generation);
      if (this.#disposed || generation !== this.#generation) return;
      if (this.#queue.end >= position + seconds || this.#eof) {
        if (!this.#queue.firstFrames.every(Boolean) || !this.#queue.tracks[2].length) throw new ViewerError("invalid-file", "Missing panorama samples.");
        return;
      }
    }
    if (!this.#disposed && generation === this.#generation) throw new ViewerError("resource-limit", "Panorama preroll exceeded its budget.");
  }
  private active(generation: number) { return !this.#disposed && !this.#failed && this.#wanted && generation === this.#generation; }
  private async decode(generation: number) {
    while (this.active(generation) && !this.#eof) {
      if (this.#queue.end - this.position() >= PREFETCH_SECONDS || this.#queue.full) {
        if (!this.#playing && this.#queue.end < this.#position + BUFFER_SECONDS) throw new ViewerError("resource-limit", "Unbalanced panorama tracks.");
        await this.waitForDrain(); continue;
      }
      await this.pull(this.position(), generation);
      if (!this.active(generation)) return;
      if (this.#playing) this.scheduleAudio();
      else if (this.#queue.end >= this.#position + BUFFER_SECONDS || this.#eof) this.startClock();
    }
  }
  private waitForDrain() {
    return new Promise<void>(resolve => {
      const timer = setTimeout(() => { this.#delay = undefined; resolve(); }, 20);
      this.#delay = { timer, resolve };
    });
  }
  private position() {
    return this.#playing ? Math.min(this.#duration, this.#queue.end, this.#clockMedia + Math.max(0, this.#context!.currentTime - this.#clockWall)) : this.#position;
  }
  private startClock() {
    this.#playing = true; this.#clockMedia = this.#position; this.#clockWall = this.#context!.currentTime + 0.02;
    this.elements.status.textContent = this.#copy.software; this.scheduleAudio(); this.update();
  }
  private stopClock() {
    this.#position = this.position(); this.#playing = false;
    if (this.#delay) { clearTimeout(this.#delay.timer); this.#delay.resolve(); this.#delay = undefined; }
    if (this.#animation !== undefined) cancelAnimationFrame(this.#animation); this.#animation = undefined;
    for (const source of this.#sources) { source.onended = null; source.stop(); source.disconnect(); source.buffer = null; }
    this.#sources.clear(); this.#scheduled = new WeakSet();
  }
  private scheduleAudio() {
    const context = this.#context!;
    for (const frame of this.#queue.tracks[2]) {
      if (this.#scheduled.has(frame)) continue;
      this.#scheduled.add(frame);
      const offset = Math.max(0, Math.ceil((Math.max(this.#clockMedia, this.position()) - frame.timestamp) * frame.sampleRate));
      if (offset >= frame.samples) continue;
      const buffer = context.createBuffer(frame.channels, frame.samples - offset, frame.sampleRate), pcm = new Float32Array(frame.data);
      for (let channel = 0; channel < frame.channels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) samples[i] = pcm[(i + offset) * frame.channels + channel];
      }
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(this.#gain!); this.#sources.add(source);
      source.onended = () => { this.#sources.delete(source); source.disconnect(); source.buffer = null; };
      source.start(Math.max(context.currentTime, this.#clockWall + frame.timestamp + offset / frame.sampleRate - this.#clockMedia));
    }
  }
  private draw(first: DecodedFrame, second: DecodedFrame) {
    if (this.#drawn?.[0] === first && this.#drawn[1] === second) return;
    const frames: VideoFrame[] = [];
    try {
      for (const frame of [first, second]) frames.push(new VideoFrame(frame.data, {
        colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false },
        format: "I420", codedWidth: frame.width, codedHeight: frame.height, timestamp: Math.round(frame.timestamp * 1e6),
      }));
      this.renderer.setDualFrames(frames[0], frames[1], first.width, first.height, this.projection);
      this.#drawn = [first, second];
    } finally { frames.forEach(frame => frame.close()); }
  }
  private drawFirst() {
    const [first, second] = this.#queue.firstFrames;
    if (first && second && !this.#disposed) this.draw(first, second);
  }
  private tick = () => {
    if (this.#disposed || this.#failed || !this.#wanted) return;
    const position = this.position();
    if (this.#playing) {
      // Retain the last presented frame of each lens until its replacement is due.
      for (let lens = 0; lens < 2; lens++) {
        while (this.#queue.tracks[lens][1]?.timestamp <= position) this.#queue.shift(lens);
      }
      this.drawFirst();
      while (this.#queue.tracks[2][0] && this.#queue.tracks[2][0].timestamp + this.#queue.tracks[2][0].duration <= position) this.#queue.shift(2);
      if (this.#eof && position >= this.#duration - 0.001) {
        this.stopClock(); this.#position = this.#duration; this.#wanted = false; this.update(); return;
      }
      if (!this.#eof && position >= this.#queue.end - 0.005) {
        this.stopClock(); this.elements.status.textContent = this.#copy.buffering;
      }
    }
    this.update(); this.#animation = requestAnimationFrame(this.tick);
  };
  private update() {
    const { play, seek, time } = this.elements;
    if (!play || !seek || !time) return;
    const position = this.position(); seek.min = "0"; seek.max = String(this.#duration); seek.value = String(position);
    const label = this.#wanted ? this.#copy.pause : position >= this.#duration - 0.001 ? this.#copy.replay : this.#copy.play;
    play.textContent = label; play.setAttribute("aria-label", label);
    time.textContent = `${formatTime(position)} / ${formatTime(this.#duration)}`;
  }
  private fail(error: unknown) {
    if (this.#disposed || this.#failed) return;
    this.stopClock(); this.#failed = true; this.#wanted = false; this.client.dispose();
    this.elements.status.textContent = error instanceof ViewerError && error.code === "resource-limit" ? this.#copy.limit : this.#copy.failed;
    this.elements.status.setAttribute("role", "alert");
    if (this.elements.play) this.elements.play.disabled = true;
    if (this.elements.seek) this.elements.seek.disabled = true;
    this.#drawn = undefined; this.#queue = new PanoramaFrameQueue(this.info.duration, this.info.sampleRate, this.info.channels);
    this.#gain?.disconnect(); void this.#context?.close().catch(() => {});
  }
  dispose() {
    if (this.#close) return this.#close;
    this.stopClock(); this.#disposed = true; this.#generation++; this.#wanted = false; this.client.dispose();
    this.#remove.splice(0).forEach(remove => remove()); this.#gain?.disconnect(); this.#drawn = undefined;
    this.#queue = new PanoramaFrameQueue(this.info.duration, this.info.sampleRate, this.info.channels);
    this.#close = this.#context && this.#context.state !== "closed" ? this.#context.close().catch(() => {}) : Promise.resolve();
    return this.#close;
  }
}
