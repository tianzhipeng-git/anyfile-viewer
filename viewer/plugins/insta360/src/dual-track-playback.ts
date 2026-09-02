import { ViewerError } from "@anyfile/viewer-protocol";
import {
  AudioBufferSink,
  BlobSource,
  CanvasSink,
  Input,
  MP4,
  type InputAudioTrack,
  type InputVideoTrack,
  type WrappedAudioBuffer,
  type WrappedCanvas,
} from "mediabunny";

import { abortError } from "./read-blob";
import type { PanoramaRenderer } from "./panorama-renderer";
import type { PanoramaProjectionProfile } from "./projection";
import { formatTime, type Insta360UiCopy, type Insta360ViewerElements } from "./ui";
import type { Insta360VideoInspection } from "./video-inspection";

const BLOB_CACHE_BYTES = 8 * 1024 * 1024;
const AUDIO_LOOKAHEAD_SECONDS = 1;

interface DualTrackMedia {
  readonly input: Input<BlobSource>;
  readonly videos: readonly [InputVideoTrack, InputVideoTrack];
  readonly audio: InputAudioTrack;
  readonly start: number;
  readonly audioStart: number;
  readonly duration: number;
}

type MediaIterator = AsyncGenerator<WrappedCanvas | WrappedAudioBuffer, void, unknown>;

async function inspectDualTrackMedia(
  file: File,
  inspection: Insta360VideoInspection,
  signal: AbortSignal,
): Promise<DualTrackMedia> {
  const input = new Input({
    source: new BlobSource(file, { maxCacheSize: BLOB_CACHE_BYTES }),
    formats: [MP4],
  });
  const abort = () => input.dispose();
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw abortError();
    if (!await input.canRead() || await input.getFormat() !== MP4) {
      throw new ViewerError("invalid-file", "Invalid Insta360 MP4 container.");
    }
    const videos = await input.getVideoTracks();
    const audios = await input.getAudioTracks();
    if (videos.length !== 2 || audios.length !== 1) {
      throw new ViewerError("invalid-file", "Expected two video tracks and one audio track.");
    }
    const dimensions = await Promise.all(videos.flatMap((track) => [track.getCodedWidth(), track.getCodedHeight()]));
    const codecs = await Promise.all([...videos.map((track) => track.getCodec()), audios[0].getCodec()]);
    if (dimensions.some((value) => value !== inspection.width)
      || codecs[0] !== "hevc" || codecs[1] !== "hevc" || codecs[2] !== "aac") {
      throw new ViewerError("invalid-file", "Unexpected Insta360 media tracks.");
    }
    if (typeof VideoDecoder === "undefined" || typeof AudioDecoder === "undefined") {
      throw new ViewerError("unsupported-environment", "WebCodecs is unavailable.");
    }
    const starts = await Promise.all([videos[0].getFirstTimestamp(), videos[1].getFirstTimestamp()]);
    const audioStart = await audios[0].getFirstTimestamp();
    const start = Math.max(0, ...starts);
    const durations = await Promise.all([...videos, audios[0]].map((track) => (
      input.getDurationFromMetadata([track], { skipLiveWait: true })
    )));
    const duration = durations.every((value): value is number => value !== null && Number.isFinite(value))
      ? Math.min(...durations)
      : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(audioStart) || !Number.isFinite(duration)
      || duration <= start || audioStart >= duration) {
      throw new ViewerError("invalid-file", "Invalid Insta360 track timeline.");
    }
    signal.removeEventListener("abort", abort);
    return { input, videos: [videos[0], videos[1]], audio: audios[0], start, audioStart, duration };
  } catch (error) {
    signal.removeEventListener("abort", abort);
    input.dispose();
    if (signal.aborted) throw abortError();
    throw error;
  }
}

export class DualTrackPlayback {
  readonly #media: DualTrackMedia;
  readonly #renderer: PanoramaRenderer;
  readonly #projection: PanoramaProjectionProfile;
  readonly #elements: Insta360ViewerElements;
  readonly #copy: Insta360UiCopy;
  readonly #videoSinks: readonly [CanvasSink, CanvasSink];
  readonly #audioSink: AudioBufferSink;
  readonly #audioContext: AudioContext;
  readonly #gain: GainNode;
  readonly #iterators = new Set<MediaIterator>();
  readonly #audioSources = new Set<AudioBufferSourceNode>();
  readonly #listeners: Array<() => void> = [];
  readonly #delays = new Map<number, () => void>();
  #position: number;
  #clockMedia = 0;
  #clockWall = 0;
  #generation = 0;
  #animationFrame: number | undefined;
  #seekRequest = 0;
  #resumeAfterSeek = false;
  #playing = false;
  #disposed = false;
  #failed = false;

  private constructor(
    media: DualTrackMedia,
    projection: PanoramaProjectionProfile,
    renderer: PanoramaRenderer,
    elements: Insta360ViewerElements,
    copy: Insta360UiCopy,
  ) {
    this.#media = media;
    this.#projection = projection;
    this.#renderer = renderer;
    this.#elements = elements;
    this.#copy = copy;
    this.#position = media.start;
    this.#videoSinks = [new CanvasSink(media.videos[0], { poolSize: 2 }), new CanvasSink(media.videos[1], { poolSize: 2 })];
    this.#audioSink = new AudioBufferSink(media.audio);
    this.#audioContext = new AudioContext({ latencyHint: "playback" });
    this.#gain = this.#audioContext.createGain();
    this.#gain.connect(this.#audioContext.destination);
  }

  static async open(
    file: File,
    inspection: Insta360VideoInspection,
    projection: PanoramaProjectionProfile,
    renderer: PanoramaRenderer,
    elements: Insta360ViewerElements,
    copy: Insta360UiCopy,
    signal: AbortSignal,
  ) {
    if (typeof AudioContext === "undefined") {
      throw new ViewerError("unsupported-environment", "Web Audio is unavailable.");
    }
    const media = await inspectDualTrackMedia(file, inspection, signal);
    const playback = new DualTrackPlayback(media, projection, renderer, elements, copy);
    try {
      await playback.initialize(inspection);
      return playback;
    } catch (error) {
      await playback.dispose();
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof ViewerError) throw error;
      throw new ViewerError("unsupported-environment", "The browser could not decode the first HEVC frames.", { cause: error });
    }
  }

  private async initialize(inspection: Insta360VideoInspection) {
    const frames = await Promise.all(this.#videoSinks.map((sink) => sink.getCanvas(this.#position)));
    if (!frames[0] || !frames[1]) throw new ViewerError("invalid-file", "The fisheye tracks have no first frame.");
    const audio = await this.#audioSink.getBuffer(Math.max(this.#position, this.#media.audioStart));
    if (!audio) throw new ViewerError("invalid-file", "The audio track has no first buffer.");
    this.#renderer.setDualFrames(frames[0].canvas, frames[1].canvas, inspection.width, inspection.height, this.#projection);
    const { play, seek, volume, viewport } = this.#elements;
    if (!play || !seek || !volume) throw new ViewerError("open-failed", "Missing playback controls.");
    this.listen(play, "click", () => void this.toggle());
    this.listen(seek, "input", () => void this.seek(Number(seek.value)).catch(() => this.fail()));
    this.listen(volume, "input", () => { this.#gain.gain.value = Number(volume.value); });
    this.listen(viewport, "keydown", (event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.key !== " ") return;
      keyboard.preventDefault();
      void this.toggle();
    });
    this.updateControls();
  }

  private listen(target: EventTarget, type: string, listener: EventListener) {
    target.addEventListener(type, listener);
    this.#listeners.push(() => target.removeEventListener(type, listener));
  }

  private async toggle() {
    try {
      if (this.#playing) this.pause();
      else await this.play();
    } catch {
      this.fail();
    }
  }

  private async play() {
    if (this.#disposed || this.#failed || this.#playing) return;
    if (this.#position >= this.#media.duration - 0.001) await this.seek(this.#media.start);
    await this.#audioContext.resume();
    if (this.#disposed) return;
    this.cancelPipelines();
    const generation = this.#generation;
    this.#playing = true;
    this.#clockMedia = this.#position;
    this.#clockWall = this.#audioContext.currentTime;
    this.updateControls();
    void this.runVideo(generation).catch(() => this.fail());
    void this.runAudio(generation).catch(() => this.fail());
    this.updateTimeline();
  }

  private pause() {
    if (!this.#playing) return;
    this.#position = this.currentPosition();
    this.#playing = false;
    this.cancelPipelines();
    this.updateControls();
  }

  private async seek(position: number) {
    if (this.#disposed || !Number.isFinite(position)) return;
    const request = ++this.#seekRequest;
    const resume = this.#playing || this.#resumeAfterSeek;
    this.#resumeAfterSeek = resume;
    if (this.#playing) this.pause();
    else this.cancelPipelines();
    this.#position = Math.min(this.#media.duration, Math.max(this.#media.start, position));
    this.updateControls();
    if (this.#position < this.#media.duration) {
      const frames = await Promise.all(this.#videoSinks.map((sink) => sink.getCanvas(this.#position)));
      if (this.#disposed || request !== this.#seekRequest) return;
      if (!frames[0] || !frames[1]) throw new Error("No frames at requested time.");
      this.#renderer.setDualFrames(frames[0].canvas, frames[1].canvas, 3840, 3840, this.#projection);
    }
    if (this.#resumeAfterSeek && this.#position < this.#media.duration) {
      this.#resumeAfterSeek = false;
      await this.play();
    }
  }

  private currentPosition() {
    return this.#playing
      ? Math.min(this.#media.duration, this.#clockMedia + this.#audioContext.currentTime - this.#clockWall)
      : this.#position;
  }

  private async runVideo(generation: number) {
    const iterators = this.#videoSinks.map((sink) => sink.canvases(this.#position)) as [MediaIterator, MediaIterator];
    iterators.forEach((iterator) => this.#iterators.add(iterator));
    try {
      while (this.active(generation)) {
        const [first, second] = await Promise.all(iterators.map((iterator) => iterator.next()));
        if (first.done || second.done || !this.active(generation)) break;
        const left = first.value as WrappedCanvas;
        const right = second.value as WrappedCanvas;
        await this.waitUntil(Math.max(left.timestamp, right.timestamp), generation);
        if (!this.active(generation)) break;
        this.#renderer.setDualFrames(left.canvas, right.canvas, 3840, 3840, this.#projection);
      }
    } finally {
      iterators.forEach((iterator) => this.#iterators.delete(iterator));
    }
  }

  private async runAudio(generation: number) {
    const iterator = this.#audioSink.buffers(Math.max(this.#position, this.#media.audioStart)) as MediaIterator;
    this.#iterators.add(iterator);
    try {
      while (this.active(generation)) {
        const result = await iterator.next();
        if (result.done || !this.active(generation)) break;
        const wrapped = result.value as WrappedAudioBuffer;
        while (this.active(generation) && wrapped.timestamp - this.currentPosition() > AUDIO_LOOKAHEAD_SECONDS) {
          await this.delay(50);
        }
        if (this.active(generation)) this.scheduleAudio(wrapped);
      }
    } finally {
      this.#iterators.delete(iterator);
    }
  }

  private scheduleAudio({ buffer, timestamp, duration }: WrappedAudioBuffer) {
    const source = this.#audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.#gain);
    const offset = Math.max(0, this.#clockMedia - timestamp);
    if (offset >= duration) return;
    const when = Math.max(this.#audioContext.currentTime, this.#clockWall + timestamp - this.#clockMedia + offset);
    source.addEventListener("ended", () => this.#audioSources.delete(source), { once: true });
    this.#audioSources.add(source);
    source.start(when, offset);
  }

  private async waitUntil(timestamp: number, generation: number) {
    while (this.active(generation)) {
      const remaining = timestamp - this.currentPosition();
      if (remaining <= 0) return;
      await this.delay(Math.min(50, remaining * 1000));
    }
  }

  private delay(milliseconds: number) {
    return new Promise<void>((resolve) => {
      const id = window.setTimeout(() => { this.#delays.delete(id); resolve(); }, milliseconds);
      this.#delays.set(id, resolve);
    });
  }

  private updateTimeline = () => {
    if (!this.#playing || this.#disposed) return;
    this.#position = this.currentPosition();
    this.updateControls();
    if (this.#position >= this.#media.duration) {
      this.#playing = false;
      this.cancelPipelines();
      this.updateControls();
      return;
    }
    this.#animationFrame = requestAnimationFrame(this.updateTimeline);
  };

  private updateControls() {
    const { play, seek, time } = this.#elements;
    if (!play || !seek || !time) return;
    seek.min = String(this.#media.start);
    seek.max = String(this.#media.duration);
    seek.value = String(this.#position);
    time.textContent = `${formatTime(this.#position)} / ${formatTime(this.#media.duration)}`;
    const label = this.#position >= this.#media.duration ? this.#copy.replay : this.#playing ? this.#copy.pause : this.#copy.play;
    play.textContent = label;
    play.setAttribute("aria-label", label);
  }

  private active(generation: number) {
    return !this.#disposed && !this.#failed && this.#playing && generation === this.#generation;
  }

  private cancelPipelines() {
    this.#generation += 1;
    for (const iterator of this.#iterators) void iterator.return(undefined);
    this.#iterators.clear();
    for (const source of this.#audioSources) {
      try { source.stop(); } catch { /* Source may already have ended. */ }
      source.disconnect();
    }
    this.#audioSources.clear();
    if (this.#animationFrame !== undefined) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = undefined;
    for (const [id, resolve] of this.#delays) { clearTimeout(id); resolve(); }
    this.#delays.clear();
  }

  private fail() {
    if (this.#disposed || this.#failed) return;
    this.#position = this.currentPosition();
    this.#playing = false;
    this.#failed = true;
    this.cancelPipelines();
    if (this.#elements.play) this.#elements.play.disabled = true;
    if (this.#elements.seek) this.#elements.seek.disabled = true;
    this.#elements.status.textContent = this.#copy.playbackFailed;
  }

  async dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#seekRequest += 1;
    this.#playing = false;
    this.cancelPipelines();
    this.#listeners.splice(0).forEach((remove) => remove());
    this.#gain.disconnect();
    this.#media.input.dispose();
    if (this.#audioContext.state !== "closed") {
      try { await this.#audioContext.close(); } catch { /* Best effort during teardown. */ }
    }
  }
}
