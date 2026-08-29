import {
  AudioBufferSink,
  CanvasSink,
  type WrappedAudioBuffer,
  type WrappedCanvas,
} from "mediabunny";

import { AUDIO_LOOKAHEAD_SECONDS } from "./playback-limits";
import type { MediaDescription } from "./media-inspection";
import {
  type PlayerCopy,
  type PlayerElements,
  updateTime,
} from "./ui";

type MediaIterator = AsyncGenerator<WrappedCanvas | WrappedAudioBuffer, void, unknown>;

export class PlaybackSession {
  readonly #media: MediaDescription;
  readonly #elements: PlayerElements;
  readonly #copy: PlayerCopy;
  readonly #videoSink: CanvasSink;
  readonly #audioSink: AudioBufferSink | null;
  readonly #audioContext: AudioContext | null;
  readonly #gain: GainNode | null;
  readonly #displayContext: CanvasRenderingContext2D;
  readonly #listeners: Array<() => void> = [];
  readonly #iterators = new Set<MediaIterator>();
  readonly #audioSources = new Set<AudioBufferSourceNode>();
  readonly #delays = new Map<number, () => void>();
  #position: number;
  #clockMedia = 0;
  #clockWall = 0;
  #generation = 0;
  #animationFrame: number | null = null;
  #seekRequest = 0;
  #resumeAfterSeek = false;
  #playing = false;
  #disposed = false;
  #failed = false;

  constructor(media: MediaDescription, elements: PlayerElements, copy: PlayerCopy) {
    this.#media = media;
    this.#elements = elements;
    this.#copy = copy;
    this.#position = media.startTimestamp;
    this.#videoSink = new CanvasSink(media.videoTrack, { poolSize: 2 });
    this.#audioSink = media.audioTrack ? new AudioBufferSink(media.audioTrack) : null;
    this.#audioContext = media.audioTrack ? new AudioContext({ latencyHint: "playback" }) : null;
    this.#gain = this.#audioContext?.createGain() ?? null;
    this.#gain?.connect(this.#audioContext!.destination);
    const displayContext = elements.canvas.getContext("2d", { alpha: false });
    if (!displayContext) throw new Error("2D canvas is unavailable.");
    this.#displayContext = displayContext;
  }

  async initialize() {
    const firstFrame = await this.#videoSink.getCanvas(this.#position);
    if (!firstFrame) throw new Error("The primary video track has no decodable first frame.");
    this.#draw(firstFrame);
    if (this.#audioSink) {
      const iterator = this.#audioSink.buffers(this.#media.audioStartTimestamp!);
      const firstBuffer = await iterator.next();
      await iterator.return(undefined);
      if (firstBuffer.done) throw new Error("The primary audio track has no decodable first buffer.");
    }
    this.#listen(this.#elements.playButton, "click", () => void this.#toggle());
    this.#listen(this.#elements.seek, "input", () => {
      void this.seek(Number(this.#elements.seek.value)).catch(() => this.#showFailure());
    });
    this.#listen(this.#elements.volume, "input", () => {
      if (this.#gain) this.#gain.gain.value = Number(this.#elements.volume.value);
    });
  }

  #listen(target: EventTarget, type: string, listener: EventListener) {
    target.addEventListener(type, listener);
    this.#listeners.push(() => target.removeEventListener(type, listener));
  }

  async #toggle() {
    try {
      if (this.#playing) this.pause();
      else await this.play();
    } catch {
      this.#showFailure();
    }
  }

  async play() {
    if (this.#disposed || this.#failed || this.#playing) return;
    if (this.#position >= this.#media.duration - 0.001) {
      await this.seek(this.#media.startTimestamp);
    }
    await this.#audioContext?.resume();
    if (this.#disposed) return;
    this.#cancelPipelines();
    const generation = this.#generation;
    this.#playing = true;
    this.#clockMedia = this.#position;
    this.#clockWall = this.#wallTime();
    this.#elements.playButton.textContent = this.#copy.pause;
    void this.#runVideo(generation).catch(() => this.#showFailure());
    if (this.#audioSink) void this.#runAudio(generation).catch(() => this.#showFailure());
    this.#updateTimeline();
  }

  pause() {
    if (this.#disposed || !this.#playing) return;
    this.#position = this.currentPosition();
    this.#playing = false;
    this.#elements.playButton.textContent = this.#copy.play;
    this.#cancelPipelines();
    updateTime(this.#elements, this.#position, this.#media.duration);
  }

  async seek(position: number) {
    if (this.#disposed || !Number.isFinite(position)) return;
    const request = ++this.#seekRequest;
    if (this.#playing) {
      this.#resumeAfterSeek = true;
      this.pause();
    }
    else this.#cancelPipelines();
    this.#position = Math.min(this.#media.duration, Math.max(this.#media.startTimestamp, position));
    updateTime(this.#elements, this.#position, this.#media.duration);
    if (this.#position < this.#media.duration) {
      const frame = await this.#videoSink.getCanvas(this.#position);
      if (this.#disposed || request !== this.#seekRequest) return;
      if (!frame) throw new Error("No frame exists at the requested timestamp.");
      this.#draw(frame);
    }
    else if (this.#disposed || request !== this.#seekRequest) return;
    this.#elements.playButton.textContent = this.#position >= this.#media.duration
      ? this.#copy.replay
      : this.#copy.play;
    if (this.#resumeAfterSeek && this.#position < this.#media.duration) {
      this.#resumeAfterSeek = false;
      await this.play();
    }
  }

  currentPosition() {
    if (!this.#playing) return this.#position;
    return Math.min(this.#media.duration, this.#clockMedia + this.#wallTime() - this.#clockWall);
  }

  #wallTime() {
    return this.#audioContext?.currentTime ?? performance.now() / 1000;
  }

  async #runVideo(generation: number) {
    const iterator = this.#videoSink.canvases(this.#position) as MediaIterator;
    this.#iterators.add(iterator);
    try {
      while (this.#isActive(generation)) {
        const result = await iterator.next();
        if (result.done || !this.#isActive(generation)) break;
        const frame = result.value as WrappedCanvas;
        await this.#waitFor(frame.timestamp, generation);
        if (!this.#isActive(generation)) break;
        this.#draw(frame);
      }
    } finally {
      this.#iterators.delete(iterator);
    }
  }

  async #runAudio(generation: number) {
    const iterator = this.#audioSink!.buffers(this.#position) as MediaIterator;
    this.#iterators.add(iterator);
    try {
      while (this.#isActive(generation)) {
        const result = await iterator.next();
        if (result.done || !this.#isActive(generation)) break;
        const wrapped = result.value as WrappedAudioBuffer;
        const end = wrapped.timestamp + wrapped.duration;
        if (end <= this.#clockMedia) continue;
        while (this.#isActive(generation)
          && wrapped.timestamp - this.currentPosition() > AUDIO_LOOKAHEAD_SECONDS) {
          await this.#delay(50);
        }
        if (!this.#isActive(generation)) break;
        this.#scheduleAudio(wrapped);
      }
    } finally {
      this.#iterators.delete(iterator);
    }
  }

  #scheduleAudio({ buffer, timestamp, duration }: WrappedAudioBuffer) {
    const context = this.#audioContext!;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.#gain!);
    const offset = Math.max(0, this.#clockMedia - timestamp);
    if (offset >= duration) return;
    const when = Math.max(context.currentTime, this.#clockWall + timestamp - this.#clockMedia + offset);
    source.addEventListener("ended", () => this.#audioSources.delete(source), { once: true });
    this.#audioSources.add(source);
    source.start(when, offset);
  }

  async #waitFor(timestamp: number, generation: number) {
    while (this.#isActive(generation)) {
      const remaining = timestamp - this.currentPosition();
      if (remaining <= 0) return;
      await this.#delay(Math.min(50, remaining * 1000));
    }
  }

  #delay(milliseconds: number) {
    return new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        this.#delays.delete(id);
        resolve();
      }, milliseconds);
      this.#delays.set(id, resolve);
    });
  }

  #draw({ canvas }: WrappedCanvas) {
    this.#displayContext.drawImage(canvas, 0, 0, this.#elements.canvas.width, this.#elements.canvas.height);
  }

  #updateTimeline = () => {
    if (!this.#playing || this.#disposed) return;
    const position = this.currentPosition();
    updateTime(this.#elements, position, this.#media.duration);
    if (position >= this.#media.duration) {
      this.#position = this.#media.duration;
      this.#playing = false;
      this.#elements.playButton.textContent = this.#copy.replay;
      this.#cancelPipelines();
      return;
    }
    this.#animationFrame = requestAnimationFrame(this.#updateTimeline);
  };

  #isActive(generation: number) {
    return !this.#disposed && !this.#failed && this.#playing && generation === this.#generation;
  }

  #cancelPipelines() {
    this.#generation += 1;
    for (const iterator of this.#iterators) void iterator.return(undefined);
    this.#iterators.clear();
    for (const source of this.#audioSources) {
      try { source.stop(); } catch { /* The source may already have ended. */ }
      source.disconnect();
    }
    this.#audioSources.clear();
    if (this.#animationFrame !== null) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = null;
    for (const [id, resolve] of this.#delays) {
      clearTimeout(id);
      resolve();
    }
    this.#delays.clear();
  }

  #showFailure() {
    if (this.#disposed || this.#failed) return;
    this.#position = this.currentPosition();
    this.#playing = false;
    this.#failed = true;
    this.#cancelPipelines();
    this.#elements.playButton.disabled = true;
    this.#elements.seek.disabled = true;
    this.#elements.status.textContent = this.#copy.failed;
    this.#elements.status.dataset.visible = "true";
  }

  async dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#seekRequest += 1;
    this.#playing = false;
    this.#cancelPipelines();
    for (const remove of this.#listeners.splice(0)) remove();
    this.#gain?.disconnect();
    this.#media.input.dispose();
    if (this.#audioContext && this.#audioContext.state !== "closed") {
      try { await this.#audioContext.close(); } catch { /* Closing is best-effort during teardown. */ }
    }
    this.#elements.canvas.width = 0;
    this.#elements.canvas.height = 0;
    this.#elements.root.remove();
  }
}
