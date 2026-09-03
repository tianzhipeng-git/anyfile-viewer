import { CanvasSurface, ResourceScope } from "./index";

/**
 * Point in the audio graph the visualizer reads from.
 *
 * `node` taps an AudioContext the caller already owns; the visualizer adds a side branch
 * and never closes that context. `media` wraps a native `<audio>` element, so the
 * visualizer builds and owns the AudioContext itself.
 */
export type AudioVisualizerTap =
  | { readonly kind: "node"; readonly node: AudioNode }
  | { readonly kind: "media"; readonly element: HTMLMediaElement };

/** Effect order used by the canvas activation cycle; the public mode type follows it. */
const MODES = ["spectrum", "waveform"] as const;

export type AudioVisualizerMode = (typeof MODES)[number];

export interface AudioVisualizerOptions {
  /** `spectrum` draws a smooth bouncing envelope, `waveform` an oscilloscope trace. */
  readonly mode?: AudioVisualizerMode;
  readonly fftSize?: number;
  /** Spectrum smoothing only; 0 gives the sharpest bounce, 1 barely moves. */
  readonly smoothing?: number;
  readonly lineWidth?: number;
}

function audioContextConstructor(): typeof AudioContext | undefined {
  const scope = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

function prefersReducedMotion(): boolean {
  return typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function closeContext(context: AudioContext | null) {
  if (!context) return;
  try {
    if (context.state !== "closed") await context.close();
  } catch {
    /* Best effort: a closed or detached context must not break teardown. */
  }
}

/**
 * Audio-reactive curve painted onto a caller-owned `<canvas>`.
 *
 * Drawing algorithm and the file-to-touch guide for switching effects live in
 * `viewer/rendering/audio-visualizer.md`.
 *
 * Only rendering is shared here: DPR sizing, the animation loop, analyser reads, theme
 * colour and idempotent teardown, all built on `CanvasSurface` and `ResourceScope`. The
 * caller keeps audio graph ownership, decides where the canvas lives in its own prefixed
 * DOM, and drives playback state.
 *
 * Loop control differs per tap shape:
 *
 * - `node`: the caller calls `setActive()` from its own play/pause transitions.
 * - `media`: the visualizer follows the element's `play`, `pause` and `ended` events,
 *   because the AudioContext can only be built inside a user-gesture initiated task.
 *
 * Clicking the canvas, or pressing Enter/Space while it holds focus, cycles to the next
 * effect. Only the listeners live here: making the canvas focusable and naming it
 * (`tabindex`, `role`, `aria-label`, `title`, `cursor`) stays with the caller, which owns
 * the element, its CSS and its localisation.
 *
 * With `prefers-reduced-motion: reduce` no loop runs and a static resting line is kept;
 * cycling then repaints that line once instead of starting an animation.
 */
export class AudioVisualizer {
  private readonly resources = new ResourceScope();
  private readonly surface: CanvasSurface;
  private mode: AudioVisualizerMode;
  private readonly fftSize: number;
  private readonly smoothing: number;
  private readonly lineWidth: number;
  private readonly still: boolean;
  private analyser: AnalyserNode | null = null;
  private frequencies: Uint8Array<ArrayBuffer> | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private stroke = "#111";
  private active = false;
  private frames = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement, options: AudioVisualizerOptions = {}) {
    this.mode = options.mode ?? "spectrum";
    this.fftSize = options.fftSize ?? 2048;
    this.smoothing = options.smoothing ?? 0.72;
    this.lineWidth = options.lineWidth ?? 1.5;
    this.still = prefersReducedMotion();
    this.readStroke();
    this.surface = new CanvasSurface(canvas, canvas, (context, width, height, dpr) => this.draw(context, width, height, dpr));
    this.resources.listen(canvas, "click", () => this.cycleMode());
    this.resources.listen(canvas, "keydown", (event) => this.onActivateKey(event as KeyboardEvent));
    this.surface.schedule();
  }

  /** Idempotent. Safe to call once the caller's AudioContext exists, or never at all. */
  attach(tap: AudioVisualizerTap) {
    if (this.disposed || this.analyser || this.still || !audioContextConstructor()) return;
    if (tap.kind === "node") this.attachNode(tap.node);
    else this.attachMedia(tap.element);
  }

  /** Starts or stops the animation loop; an inactive visualizer keeps one resting frame. */
  setActive(active: boolean) {
    if (this.disposed) return;
    this.active = active && !this.still;
    this.surface.schedule();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.resources.dispose();
    this.surface.dispose();
    this.analyser = null;
    this.frequencies = null;
    this.samples = null;
  }

  private attachNode(node: AudioNode) {
    try {
      const analyser = node.context.createAnalyser();
      this.configure(analyser);
      node.connect(analyser);
      this.analyser = analyser;
      // Only this side branch is released; the caller's audible path and context survive.
      this.resources.add(() => {
        try {
          node.disconnect(analyser);
        } catch {
          /* Already detached. */
        }
        analyser.disconnect();
      });
    } catch {
      this.analyser = null;
    }
  }

  private attachMedia(element: HTMLMediaElement) {
    this.resources.listen(element, "play", () => {
      void this.ensureMediaGraph(element);
    });
    this.resources.listen(element, "pause", () => this.setActive(false));
    this.resources.listen(element, "ended", () => this.setActive(false));
  }

  private async ensureMediaGraph(element: HTMLMediaElement) {
    if (this.disposed) return;
    if (this.analyser) {
      this.setActive(!element.paused);
      return;
    }
    const ContextCtor = audioContextConstructor();
    if (!ContextCtor) return;
    let context: AudioContext | null = null;
    try {
      context = new ContextCtor({ latencyHint: "playback" });
      await context.resume();
      // A suspended context would swallow the element output, so the graph is taken over
      // only after playback is confirmed running. Otherwise native audio stays untouched.
      if (this.disposed || context.state !== "running") {
        await closeContext(context);
        return;
      }
      const live: AudioContext = context;
      const source = live.createMediaElementSource(element);
      source.connect(live.destination);
      const analyser = live.createAnalyser();
      this.configure(analyser);
      source.connect(analyser);
      this.analyser = analyser;
      this.resources.add(() => {
        try {
          source.disconnect();
        } catch {
          /* Already detached. */
        }
        analyser.disconnect();
        void closeContext(live);
      });
      this.setActive(!element.paused);
    } catch {
      this.analyser = null;
      await closeContext(context);
    }
  }

  private onActivateKey(event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    // A non-native control gets no browser activation, and Space must not scroll the page.
    event.preventDefault();
    this.cycleMode();
  }

  private cycleMode() {
    if (this.disposed) return;
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    // Only spectrum smooths between frames, so the live analyser follows the new mode.
    if (this.analyser) this.analyser.smoothingTimeConstant = this.smoothingFor();
    // An idle visualizer runs no loop; repaint once so the resting line moves immediately.
    this.surface.schedule();
  }

  private configure(analyser: AnalyserNode) {
    analyser.fftSize = this.fftSize;
    analyser.smoothingTimeConstant = this.smoothingFor();
    this.frequencies = new Uint8Array(analyser.frequencyBinCount);
    this.samples = new Float32Array(analyser.fftSize);
  }

  private smoothingFor() {
    return this.mode === "spectrum" ? this.smoothing : 0;
  }

  private draw(context: CanvasRenderingContext2D, width: number, height: number, dpr: number) {
    if (this.disposed) return;
    // CanvasSurface falls back to 800x600 for an unlaid-out element; skip hidden frames
    // and let its ResizeObserver restart the loop once the canvas becomes visible again.
    if (this.canvas.clientWidth === 0 || this.canvas.clientHeight === 0) return;
    // Reading the theme colour once per second avoids a style recalculation every frame.
    if (this.frames % 60 === 0) this.readStroke();
    this.frames += 1;
    this.paint(context, width, height, dpr);
    if (this.active && this.analyser) this.surface.schedule();
  }

  private paint(context: CanvasRenderingContext2D, width: number, height: number, dpr: number) {
    // CanvasSurface sizes the backing store in device pixels but leaves the transform to
    // the draw callback, so CSS-space coordinates must be scaled here.
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.beginPath();
    if (this.analyser && this.frequencies && this.samples) {
      if (this.mode === "waveform") this.traceWaveform(context, width, height);
      else this.traceSpectrum(context, width, height);
    } else {
      this.traceResting(context, width, height);
    }
    context.strokeStyle = this.stroke;
    context.lineWidth = this.lineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
  }

  private traceSpectrum(context: CanvasRenderingContext2D, width: number, height: number) {
    const analyser = this.analyser!;
    const bins = this.frequencies!;
    analyser.getByteFrequencyData(bins);
    // Upper octaves stay near zero for music; trimming them lets the curve fill the box.
    const usable = Math.max(8, Math.floor(bins.length * 0.7));
    const baseline = height - this.lineWidth;
    const amplitude = Math.max(1, height - this.lineWidth * 3);
    for (let x = 0; x < width; x += 1) {
      const ratio = width > 1 ? x / (width - 1) : 0;
      // Power curve spreads low frequencies over more horizontal room.
      const index = Math.min(usable - 1, Math.floor(ratio ** 1.6 * usable));
      const y = baseline - (bins[index] / 255) * amplitude;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
  }

  private traceWaveform(context: CanvasRenderingContext2D, width: number, height: number) {
    const analyser = this.analyser!;
    const samples = this.samples!;
    analyser.getFloatTimeDomainData(samples);
    const center = height / 2;
    const amplitude = (height / 2) * 0.88;
    const step = samples.length / Math.max(1, width);
    for (let x = 0; x < width; x += 1) {
      const index = Math.min(samples.length - 1, Math.floor(x * step));
      const y = center - samples[index] * amplitude;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
  }

  private traceResting(context: CanvasRenderingContext2D, width: number, height: number) {
    const y = this.mode === "waveform" ? height / 2 : height - this.lineWidth;
    context.moveTo(0, y);
    context.lineTo(width, y);
  }

  private readStroke() {
    const color = getComputedStyle(this.canvas).color;
    if (color) this.stroke = color;
  }
}
