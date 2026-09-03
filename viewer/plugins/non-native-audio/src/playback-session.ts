import type { WrappedAudioBuffer } from "mediabunny";
import { MAX_BUFFER_BYTES, MAX_BUFFER_SECONDS, PCM_LOOKAHEAD_SECONDS } from "./limits";
import type { AudioDescription } from "./media-inspection";
import { type PlayerCopy, type PlayerElements, updateTime } from "./ui";

type AudioIterator = AsyncGenerator<WrappedAudioBuffer, void, unknown>;

export class AudioPlaybackSession {
  readonly #media: AudioDescription;
  readonly #elements: PlayerElements;
  readonly #copy: PlayerCopy;
  readonly #listeners: Array<() => void> = [];
  readonly #iterators = new Set<AudioIterator>();
  readonly #sources = new Set<AudioBufferSourceNode>();
  readonly #delays = new Map<number, () => void>();
  #audioContext: AudioContext | null = null;
  #gain: GainNode | null = null;
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

  constructor(media: AudioDescription, elements: PlayerElements, copy: PlayerCopy) {
    this.#media = media; this.#elements = elements; this.#copy = copy; this.#position = media.startTimestamp;
  }

  initialize() {
    this.#listen(this.#elements.play, "click", () => void this.#toggle());
    this.#listen(this.#elements.seek, "input", () => void this.seek(Number(this.#elements.seek.value)).catch(() => this.#showFailure()));
    this.#listen(this.#elements.volume, "input", () => { if (this.#gain) this.#gain.gain.value = Number(this.#elements.volume.value); });
  }

  #setPlayState(state: "play" | "pause" | "replay") {
    this.#elements.play.dataset.state = state;
    this.#elements.play.setAttribute("aria-label", this.#copy[state]);
  }

  #listen(target: EventTarget, type: string, listener: EventListener) {
    target.addEventListener(type, listener); this.#listeners.push(() => target.removeEventListener(type, listener));
  }

  async #toggle() { try { if (this.#playing) this.pause(); else await this.play(); } catch { this.#showFailure(); } }

  async #ensureAudioContext() {
    if (!this.#audioContext) {
      this.#audioContext = new AudioContext({ latencyHint: "playback", sampleRate: this.#media.sampleRate });
      this.#gain = this.#audioContext.createGain();
      this.#gain.gain.value = Number(this.#elements.volume.value);
      this.#gain.connect(this.#audioContext.destination);
    }
    await this.#audioContext.resume();
  }

  async play() {
    if (this.#disposed || this.#failed || this.#playing) return;
    if (this.#position >= this.#media.duration - 0.001) await this.seek(this.#media.startTimestamp);
    await this.#ensureAudioContext();
    if (this.#disposed) return;
    this.#cancelPipeline();
    const generation = this.#generation;
    this.#playing = true; this.#clockMedia = this.#position; this.#clockWall = this.#audioContext!.currentTime;
    this.#setPlayState("pause");
    void this.#runAudio(generation).catch(() => this.#showFailure());
    this.#updateTimeline();
  }

  pause() {
    if (this.#disposed || !this.#playing) return;
    this.#position = this.currentPosition(); this.#playing = false; this.#setPlayState("play");
    this.#cancelPipeline(); updateTime(this.#elements, this.#position, this.#media.duration);
  }

  async seek(position: number) {
    if (this.#disposed || !Number.isFinite(position)) return;
    const request = ++this.#seekRequest;
    if (this.#playing) { this.#resumeAfterSeek = true; this.pause(); } else this.#cancelPipeline();
    this.#position = Math.min(this.#media.duration, Math.max(this.#media.startTimestamp, position));
    updateTime(this.#elements, this.#position, this.#media.duration);
    if (request !== this.#seekRequest || this.#disposed) return;
    this.#setPlayState(this.#position >= this.#media.duration ? "replay" : "play");
    if (this.#resumeAfterSeek && this.#position < this.#media.duration) { this.#resumeAfterSeek = false; await this.play(); }
  }

  currentPosition() {
    if (!this.#playing || !this.#audioContext) return this.#position;
    return Math.min(this.#media.duration, this.#clockMedia + this.#audioContext.currentTime - this.#clockWall);
  }

  async #runAudio(generation: number) {
    const iterator = this.#media.sink.buffers(this.#position) as AudioIterator;
    this.#iterators.add(iterator);
    try {
      while (this.#isActive(generation)) {
        const result = await iterator.next();
        if (result.done || !this.#isActive(generation)) break;
        const wrapped = result.value;
        const bytes = wrapped.buffer.length * wrapped.buffer.numberOfChannels * 4;
        if (!Number.isFinite(wrapped.timestamp) || wrapped.duration <= 0 || wrapped.duration > MAX_BUFFER_SECONDS || bytes > MAX_BUFFER_BYTES) throw new Error("Decoded PCM buffer exceeds limits");
        if (wrapped.timestamp + wrapped.duration <= this.#clockMedia) continue;
        while (this.#isActive(generation) && wrapped.timestamp - this.currentPosition() > PCM_LOOKAHEAD_SECONDS) await this.#delay(50);
        if (this.#isActive(generation)) this.#schedule(wrapped);
      }
    } finally { this.#iterators.delete(iterator); }
  }

  #schedule({ buffer, timestamp, duration }: WrappedAudioBuffer) {
    const source = this.#audioContext!.createBufferSource(); source.buffer = buffer; source.connect(this.#gain!);
    const offset = Math.max(0, this.#clockMedia - timestamp); if (offset >= duration) return;
    const when = Math.max(this.#audioContext!.currentTime, this.#clockWall + timestamp - this.#clockMedia + offset);
    source.addEventListener("ended", () => this.#sources.delete(source), { once: true }); this.#sources.add(source); source.start(when, offset);
  }

  #delay(milliseconds: number) { return new Promise<void>((resolve) => { const id = window.setTimeout(() => { this.#delays.delete(id); resolve(); }, milliseconds); this.#delays.set(id, resolve); }); }

  #updateTimeline = () => {
    if (!this.#playing || this.#disposed) return;
    const position = this.currentPosition(); updateTime(this.#elements, position, this.#media.duration);
    if (position >= this.#media.duration) { this.#position = this.#media.duration; this.#playing = false; this.#setPlayState("replay"); this.#cancelPipeline(); return; }
    this.#animationFrame = requestAnimationFrame(this.#updateTimeline);
  };

  #isActive(generation: number) { return !this.#disposed && !this.#failed && this.#playing && generation === this.#generation; }

  #cancelPipeline() {
    this.#generation += 1;
    for (const iterator of this.#iterators) void iterator.return(undefined); this.#iterators.clear();
    for (const source of this.#sources) { try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); } this.#sources.clear();
    if (this.#animationFrame !== null) cancelAnimationFrame(this.#animationFrame); this.#animationFrame = null;
    for (const [id, resolve] of this.#delays) { clearTimeout(id); resolve(); } this.#delays.clear();
  }

  #showFailure() {
    if (this.#disposed || this.#failed) return;
    this.#position = this.currentPosition(); this.#playing = false; this.#failed = true; this.#cancelPipeline();
    this.#elements.play.disabled = true; this.#elements.seek.disabled = true; this.#elements.status.textContent = this.#copy.failed; this.#elements.status.dataset.visible = "true";
  }

  async dispose() {
    if (this.#disposed) return;
    this.#disposed = true; this.#seekRequest += 1; this.#playing = false; this.#cancelPipeline();
    for (const remove of this.#listeners.splice(0)) remove();
    this.#gain?.disconnect();
    // Mediabunny owns sink/decoder lifetimes through Input; disposing it cancels all sink operations.
    this.#media.input.dispose();
    if (this.#audioContext && this.#audioContext.state !== "closed") { try { await this.#audioContext.close(); } catch { /* Best effort. */ } }
    this.#elements.root.remove();
  }
}
