import { ViewerError } from "@anyfile/viewer-protocol";
import type { FfmpegClient } from "./client";
import type { DecodedFrame, MediaInfo } from "./types";
import { updateTime, type PlayerElements, type PlayerMessages } from "./ui";

const MAX_QUEUE_BYTES = 32 * 1024 * 1024;
const MAX_PCM_BYTES = 8 * 1024 * 1024;
export class PlaybackSession {
  #context: AudioContext | null = null;
  #gain: GainNode | null = null;
  #drawing: CanvasRenderingContext2D | null = null;
  #position = 0;
  #duration: number;
  #clockMedia = 0;
  #clockWall = 0;
  #generation = 0;
  #playing = false;
  #wantedPlaying = false;
  #disposed = false;
  #failed = false;
  #eof = false;
  #decodedEnd = 0;
  #frames: DecodedFrame[] = [];
  #primed: DecodedFrame[] = [];
  #frameBytes = 0;
  #pcmBytes = 0;
  #sources = new Map<AudioBufferSourceNode, number>();
  #pump: Promise<void> = Promise.resolve();
  #transition: Promise<void> | null = null;
  #animation: number | null = null;
  #delay: { timer: ReturnType<typeof setTimeout>; resolve: () => void } | null = null;
  #close: Promise<void> | null = null;
  #remove: Array<() => void> = [];

  constructor(readonly client: FfmpegClient, readonly info: MediaInfo, readonly elements: PlayerElements, readonly copy: PlayerMessages) { this.#duration = info.duration; }
  async initialize() {
    if (this.elements.canvas) {
      this.#drawing = this.elements.canvas.getContext("2d");
      if (!this.#drawing) throw new ViewerError("unsupported-environment", this.copy.environment);
    }
    this.#primed = await this.#prime(0, this.#generation);
    if (this.#disposed) throw new DOMException("Disposed", "AbortError");
    const first = this.#primed.find(frame => frame.kind === "video"); if (first) this.#draw(first);
    this.#listen(this.elements.play, "click", () => {
      if (this.#wantedPlaying) this.pause();
      else void this.play().catch(error => this.#fail(error));
    });
    this.#listen(this.elements.seek, "input", () => this.seek(Number(this.elements.seek.value)));
    this.#listen(this.elements.volume, "input", () => { if (this.#gain) this.#gain.gain.value = Number(this.elements.volume.value); });
    updateTime(this.elements, 0, this.#duration);
  }
  #listen(target: EventTarget, type: string, callback: EventListener) { target.addEventListener(type, callback); this.#remove.push(() => target.removeEventListener(type, callback)); }
  #validate(frame: DecodedFrame) {
    if (frame.timestamp > this.info.duration + 0.001) throw new ViewerError("invalid-file", this.copy.invalid);
    if (!Number.isFinite(frame.timestamp) || !Number.isFinite(frame.duration) || frame.duration <= 0 || frame.duration > 8 || frame.data.byteLength > 16 * 1024 * 1024) throw new ViewerError("resource-limit", this.copy.limit);
    if (frame.kind === "video" && (frame.width !== this.info.width || frame.height !== this.info.height)) throw new ViewerError("invalid-file", this.copy.invalid);
    if (frame.kind === "audio" && (frame.channels !== this.info.channels || frame.sampleRate !== this.info.sampleRate || frame.samples * frame.channels * 4 !== frame.data.byteLength)) throw new ViewerError("invalid-file", this.copy.invalid);
  }
  async #prime(position: number, generation: number) {
    const frames: DecodedFrame[] = []; let bytes = 0, video = !this.info.video, audio = !this.info.audio;
    for (let count = 0; count < 8192 && !this.#disposed && generation === this.#generation; count++) {
      const event = await this.client.next();
      if (this.#disposed || generation !== this.#generation) return [];
      if (event.kind === "eof") break;
      this.#validate(event);
      if (event.timestamp + event.duration <= position) continue;
      frames.push(event); bytes += event.data.byteLength;
      if (frames.length > 128 || bytes > MAX_QUEUE_BYTES || event.timestamp - position > 2) throw new ViewerError("resource-limit", this.copy.limit);
      if (event.kind === "video") video = true; else audio = true;
      if (video && audio) return frames;
    }
    if (this.#disposed || generation !== this.#generation) return [];
    throw new ViewerError("invalid-file", this.copy.invalid);
  }
  #wall() { return this.#context ? this.#context.currentTime : performance.now() / 1000; }
  currentPosition() { return this.#playing ? Math.min(this.#duration, this.#clockMedia + Math.max(0, this.#wall() - this.#clockWall)) : this.#position; }
  async play() {
    if (this.#disposed || this.#failed || this.#wantedPlaying) return;
    this.#wantedPlaying = true;
    // Creation/resume runs directly in the user's play gesture, before any decode await.
    if (this.info.audio) {
      if (!this.#context) {
        this.#context = new AudioContext({ latencyHint: "playback", sampleRate: this.info.sampleRate });
        this.#gain = this.#context.createGain(); this.#gain.gain.value = Number(this.elements.volume.value); this.#gain.connect(this.#context.destination);
      }
      await this.#context.resume();
      if (this.#disposed || !this.#wantedPlaying) return;
      if (this.#context.state !== "running") throw new ViewerError("unsupported-environment", this.copy.environment);
    }
    if (this.#position >= this.#duration - 0.001) this.#position = 0;
    this.#restart();
  }
  pause() {
    if (this.#disposed || this.#failed) return;
    this.#position = this.currentPosition(); this.#wantedPlaying = false; this.#generation++;
    this.#stop(); this.elements.play.textContent = this.copy.play; this.elements.status.textContent = "";
    updateTime(this.elements, this.#position, this.#duration);
  }
  seek(position: number) {
    if (this.#disposed || this.#failed || !Number.isFinite(position)) return;
    this.#position = Math.max(0, Math.min(this.#duration, position)); this.#restart();
  }
  #restart() {
    this.#generation++; this.#stop();
    updateTime(this.elements, this.#position, this.#duration);
    this.elements.status.textContent = this.copy.buffering;
    if (this.#transition) return; // Coalesce rapid seeks into the latest generation/position.
    this.#transition = this.#reconcile().catch(error => this.#fail(error)).finally(() => { this.#transition = null; });
  }
  async #reconcile() {
    while (!this.#disposed && !this.#failed) {
      const generation = this.#generation, position = this.#position;
      await this.#pump;
      if (this.#disposed) return;
      if (generation !== this.#generation) continue;
      if (position >= this.#duration - 0.001) { this.#wantedPlaying = false; this.elements.play.textContent = this.copy.replay; this.elements.status.textContent = ""; return; }
      await this.client.seek(Math.min(position, this.info.duration));
      if (this.#disposed) return;
      if (generation !== this.#generation) continue;
      const frames = await this.#prime(position, generation);
      if (this.#disposed) return;
      if (generation !== this.#generation) continue;
      this.#primed = frames;
      const first = frames.find(frame => frame.kind === "video"); if (first) this.#draw(first);
      this.elements.status.textContent = "";
      if (!this.#wantedPlaying) { this.elements.play.textContent = this.copy.play; return; }
      this.#playing = true; this.#eof = false; this.#decodedEnd = position;
      this.#clockMedia = position; this.#clockWall = this.#wall() + 0.05;
      this.elements.play.textContent = this.copy.pause;
      this.#pump = this.#decode(generation).catch(error => { if (generation === this.#generation) this.#fail(error); });
      this.#tick(); return;
    }
  }
  #active(generation: number) { return !this.#disposed && !this.#failed && this.#playing && generation === this.#generation; }
  async #decode(generation: number) {
    const last: Partial<Record<"audio" | "video", number>> = {};
    while (this.#active(generation)) {
      const event = this.#primed.shift() ?? await this.client.next();
      if (!this.#active(generation)) return;
      if (event.kind === "eof") { this.#eof = true; this.#duration = Math.max(this.info.duration, this.#decodedEnd); this.elements.seek.max = String(this.#duration); return; }
      this.#validate(event);
      if (last[event.kind] !== undefined && event.timestamp < last[event.kind]! - 0.001) throw new ViewerError("invalid-file", this.copy.invalid);
      last[event.kind] = event.timestamp;
      this.#decodedEnd = Math.max(this.#decodedEnd, event.timestamp + event.duration);
      if (event.timestamp + event.duration <= this.#clockMedia) continue;
      while (this.#active(generation) && (event.timestamp - this.currentPosition() > 0.5 || (event.kind === "video" ? this.#frames.length >= 16 || this.#frameBytes + event.data.byteLength > MAX_QUEUE_BYTES : this.#sources.size >= 64 || this.#pcmBytes + event.data.byteLength > MAX_PCM_BYTES))) await this.#wait();
      if (!this.#active(generation)) return;
      if (this.currentPosition() - Math.max(this.#clockMedia, event.timestamp + event.duration) > 2) throw new ViewerError("resource-limit", this.copy.limit);
      if (event.kind === "video") { this.#frames.push(event); this.#frameBytes += event.data.byteLength; }
      else this.#schedule(event);
    }
  }
  #schedule(frame: DecodedFrame) {
    const context = this.#context!;
    const offset = Math.max(0, Math.ceil((Math.max(this.#clockMedia, this.currentPosition()) - frame.timestamp) * frame.sampleRate));
    if (offset >= frame.samples) return;
    const buffer = context.createBuffer(frame.channels, frame.samples - offset, frame.sampleRate);
    const pcm = new Float32Array(frame.data);
    for (let channel = 0; channel < frame.channels; channel++) {
      const target = buffer.getChannelData(channel);
      for (let i = 0; i < target.length; i++) target[i] = pcm[(i + offset) * frame.channels + channel];
    }
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(this.#gain!);
    const bytes = buffer.length * buffer.numberOfChannels * 4;
    this.#sources.set(source, bytes); this.#pcmBytes += bytes;
    source.onended = () => { this.#pcmBytes -= this.#sources.get(source) ?? 0; this.#sources.delete(source); source.disconnect(); source.buffer = null; };
    source.start(Math.max(context.currentTime, this.#clockWall + frame.timestamp + offset / frame.sampleRate - this.#clockMedia));
  }
  #draw(frame: DecodedFrame) {
    if (!this.#drawing || this.#disposed) return;
    const image = new VideoFrame(frame.data, { format: "I420", codedWidth: frame.width, codedHeight: frame.height, timestamp: Math.round(frame.timestamp * 1e6) });
    try { this.#drawing.drawImage(image, 0, 0); } finally { image.close(); }
  }
  #tick = () => {
    if (!this.#playing || this.#disposed) return;
    const position = this.currentPosition();
    let latest: DecodedFrame | undefined;
    while (this.#frames[0] && this.#frames[0].timestamp <= position + 0.015) { latest = this.#frames.shift()!; this.#frameBytes -= latest.data.byteLength; }
    if (latest) this.#draw(latest);
    updateTime(this.elements, position, this.#duration);
    if (this.#eof && !this.#frames.length && !this.#sources.size && position >= this.#duration) {
      this.#position = this.#duration; this.#wantedPlaying = false; this.#stop(); this.elements.play.textContent = this.copy.replay; return;
    }
    this.#animation = requestAnimationFrame(this.#tick);
  };
  #wait() { return new Promise<void>(resolve => { const timer = setTimeout(() => { this.#delay = null; resolve(); }, 20); this.#delay = { timer, resolve }; }); }
  #stop() {
    this.#playing = false;
    if (this.#animation !== null) cancelAnimationFrame(this.#animation); this.#animation = null;
    if (this.#delay) { clearTimeout(this.#delay.timer); this.#delay.resolve(); this.#delay = null; }
    for (const source of this.#sources.keys()) { source.onended = null; source.stop(); source.disconnect(); source.buffer = null; }
    this.#sources.clear(); this.#pcmBytes = this.#frameBytes = 0; this.#frames = []; this.#primed = [];
  }
  #fail(error: unknown) {
    if (this.#disposed || this.#failed) return;
    this.#failed = true; this.#wantedPlaying = false; this.#stop(); this.client.dispose();
    this.#gain?.disconnect();
    if (this.#context && this.#context.state !== "closed") void this.#context.close().catch(() => {});
    this.elements.status.setAttribute("role", "alert"); this.elements.status.textContent = error instanceof ViewerError && error.code === "resource-limit" ? this.copy.limit : this.copy.failed;
    this.elements.play.disabled = this.elements.seek.disabled = true;
  }
  dispose(): Promise<void> {
    if (this.#close) return this.#close;
    this.#disposed = true; this.#generation++; this.#wantedPlaying = false; this.#stop(); this.client.dispose();
    for (const remove of this.#remove.splice(0)) remove();
    this.#gain?.disconnect(); this.elements.root.remove();
    this.#close = this.#context && this.#context.state !== "closed" ? this.#context.close().catch(() => {}) : Promise.resolve();
    return this.#close;
  }
}
