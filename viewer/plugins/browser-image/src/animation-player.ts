import type { FrameDecoder } from "./animation-decoder";

export interface AnimationState {
  index: number;
  duration: number | null;
  playing: boolean;
  busy: boolean;
  ended: boolean;
  rate: number;
}

/** One decode in flight and no retained VideoFrames. The decoder composites disposal/blending. */
export class AnimationPlayer {
  readonly state: AnimationState = { index: 0, duration: null, playing: false, busy: false, ended: false, rate: 1 };
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private disposed = false;
  private repeats = 0;
  private deadline = 0;

  constructor(
    private readonly decoder: FrameDecoder,
    readonly frameCount: number,
    readonly repetitionCount: number,
    private readonly draw: (frame: VideoFrame) => void,
    private readonly changed: (state: AnimationState) => void,
    private readonly failed: (error: unknown) => void,
  ) {}

  async initialize() { await this.show(0); }

  pause() {
    this.generation++;
    clearTimeout(this.timer);
    this.state.playing = false;
    this.notify();
  }

  play() {
    if (this.disposed || this.state.busy || this.state.playing || this.frameCount < 2 || this.state.duration === null) return;
    this.state.playing = true;
    if (this.state.ended) {
      this.state.ended = false;
      this.repeats = 0;
      void this.show(0).then(() => this.schedule(true)).catch(this.fail);
    } else this.schedule(true);
    this.notify();
  }

  setRate(rate: number) {
    if (this.disposed) return;
    const previous = this.state.rate;
    this.state.rate = rate;
    if (this.state.playing && !this.state.busy) {
      // Preserve the unplayed portion of the current frame when changing speed.
      const now = performance.now();
      this.deadline = now + Math.max(0, this.deadline - now) * previous / rate;
      clearTimeout(this.timer);
      this.queue();
    }
    this.notify();
  }

  step(delta: number) {
    if (this.disposed || this.state.busy) return;
    this.pause();
    this.state.ended = false;
    this.repeats = 0;
    const index = Math.max(0, Math.min(this.frameCount - 1, this.state.index + delta));
    if (index !== this.state.index) void this.show(index).catch(this.fail);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
  }

  private notify() { if (!this.disposed) this.changed({ ...this.state }); }
  private fail = (error: unknown) => {
    if (this.disposed) return;
    this.pause();
    this.failed(error);
  };

  private async show(index: number) {
    const generation = this.generation;
    this.state.busy = true;
    this.notify();
    try {
      const { image } = await this.decoder.decode({ frameIndex: index, completeFramesOnly: true });
      try {
        if (this.disposed || generation !== this.generation) return;
        this.draw(image);
        this.state.index = index;
        this.state.duration = image.duration === null ? null : image.duration / 1000;
      } finally { image.close(); }
    } finally {
      this.state.busy = false;
      this.notify();
    }
  }

  private schedule(restart: boolean) {
    if (this.disposed || !this.state.playing) return;
    if (this.state.duration === null) { this.pause(); return; }
    // A zero-duration frame still yields to the event loop. The UI retains the decoded value.
    const duration = Math.max(1, this.state.duration / this.state.rate);
    this.deadline = restart ? performance.now() + duration : Math.max(this.deadline + duration, performance.now());
    this.queue();
  }

  private queue() {
    this.timer = setTimeout(() => { void this.advance().catch(this.fail); }, Math.max(0, this.deadline - performance.now()));
  }

  private async advance() {
    if (!this.state.playing || this.disposed) return;
    let index = this.state.index + 1;
    if (index === this.frameCount) {
      if (!Number.isNaN(this.repetitionCount) && this.repeats < this.repetitionCount) {
        this.repeats++;
        index = 0;
      } else {
        this.state.ended = true;
        this.pause();
        return;
      }
    }
    await this.show(index);
    this.schedule(false);
  }
}
