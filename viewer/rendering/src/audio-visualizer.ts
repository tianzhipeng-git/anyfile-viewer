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
const MODES = ["spectrum", "waveform", "waves"] as const;

export type AudioVisualizerMode = (typeof MODES)[number];

export interface AudioVisualizerOptions {
  /** `spectrum` bouncing envelope, `waveform` oscilloscope, `waves` multi-line ribbons. */
  readonly mode?: AudioVisualizerMode;
  readonly fftSize?: number;
  /** Spectrum / waves Analyser smoothing; 0 sharpest, 1 barely moves. */
  readonly smoothing?: number;
  readonly lineWidth?: number;
}

/** Band edges as fractions of the usable (high-trimmed) frequency bins. */
const WAVE_BANDS = [0, 0.08, 0.25, 0.5, 1] as const;
/** Spatial cycles across the canvas width, bass → treble. */
const WAVE_CYCLES = [0.7, 1.2, 2.0, 3.0] as const;
const WAVE_ALPHAS = [0.25, 0.4, 0.55, 0.9] as const;
/** Vertical offsets as fractions of half-height. */
const WAVE_OFFSETS = [-0.18, -0.06, 0.06, 0.16] as const;

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
  /** Smoothed waveform Y path in CSS pixels; length matches the last painted width. */
  private waveYs: Float32Array | null = null;
  /** Per-band EMA levels that drive the waves ribbons (length = WAVE_CYCLES.length). */
  private waveLevels: Float32Array | null = null;
  /** Slow phase drift so ribbons travel instead of pulsing in place. */
  private wavePhase = 0;
  private stroke = "#111";
  private active = false;
  private frames = 0;
  private disposed = false;

  /** Analyser refresh stride for waveform (~15 Hz at 60 Hz rAF); spectrum stays every frame. */
  private static readonly WAVEFORM_SAMPLE_EVERY = 4;
  /** Blend toward each new sample; 1 = snap, lower = calmer morph. */
  private static readonly WAVEFORM_SMOOTH = 0.22;
  /** Fraction of half-height the normalised peak should reach. */
  private static readonly WAVEFORM_HEIGHT = 0.92;
  /** Ignore near-silence so peak-normalise does not amplify noise into a full swing. */
  private static readonly WAVEFORM_PEAK_FLOOR = 0.04;
  /** Band-energy EMA for waves; lower than waveform path EMA → calmer big swells. */
  private static readonly WAVES_LEVEL_SMOOTH = 0.09;
  /** Peak ribbon amplitude as a fraction of half-height. */
  private static readonly WAVES_HEIGHT = 0.72;
  /** Draw every N CSS pixels; sine paths stay smooth without a per-pixel loop. */
  private static readonly WAVES_STEP = 2;

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
    this.waveYs = null;
    this.waveLevels = null;
    this.wavePhase = 0;
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
    // Drop smoothed state so the next waveform / waves frame seeds cleanly.
    this.waveYs = null;
    this.waveLevels = null;
    this.wavePhase = 0;
    // Spectrum and waves use AnalyserNode smoothing; waveform calms via its own EMA.
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
    return this.mode === "waveform" ? 0 : this.smoothing;
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
    context.strokeStyle = this.stroke;
    context.lineWidth = this.lineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    if (this.analyser && this.frequencies && this.samples) {
      if (this.mode === "waveform") {
        context.beginPath();
        this.traceWaveform(context, width, height);
        context.stroke();
      } else if (this.mode === "waves") {
        // Waves strokes each ribbon itself so per-line alpha can differ.
        this.traceWaves(context, width, height);
      } else {
        context.beginPath();
        this.traceSpectrum(context, width, height);
        context.stroke();
      }
    } else {
      context.beginPath();
      this.traceResting(context, width, height);
      context.stroke();
    }
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
    const fresh = !this.waveYs || this.waveYs.length !== width;
    const sampleNow = fresh || this.frames % AudioVisualizer.WAVEFORM_SAMPLE_EVERY === 0;
    if (sampleNow) this.sampleWaveform(width, height, fresh);
    const ys = this.waveYs!;
    for (let x = 0; x < width; x += 1) {
      const y = ys[x]!;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
  }

  private sampleWaveform(width: number, height: number, fresh: boolean) {
    const analyser = this.analyser!;
    const samples = this.samples!;
    analyser.getFloatTimeDomainData(samples);
    const center = height / 2;
    const amplitude = (height / 2) * AudioVisualizer.WAVEFORM_HEIGHT;
    // Rising zero-crossing trigger: without a phase lock each window starts at a random
    // offset and the trace thrashes. Search only the first half so enough samples remain.
    let start = 0;
    const searchEnd = Math.floor(samples.length / 2);
    for (let i = 1; i < searchEnd; i += 1) {
      if (samples[i - 1]! < 0 && samples[i]! >= 0) {
        start = i;
        break;
      }
    }
    if (fresh) this.waveYs = new Float32Array(width);
    const ys = this.waveYs!;
    const alpha = fresh ? 1 : AudioVisualizer.WAVEFORM_SMOOTH;
    const step = (samples.length - start) / Math.max(1, width);
    // Real music rarely hits ±1; scale the drawn window so its peak fills the canvas.
    let peak = AudioVisualizer.WAVEFORM_PEAK_FLOOR;
    for (let x = 0; x < width; x += 1) {
      const index = Math.min(samples.length - 1, start + Math.floor(x * step));
      const value = Math.abs(samples[index]!);
      if (value > peak) peak = value;
    }
    const scale = amplitude / peak;
    for (let x = 0; x < width; x += 1) {
      const index = Math.min(samples.length - 1, start + Math.floor(x * step));
      const raw = center - samples[index]! * scale;
      ys[x] = ys[x]! * (1 - alpha) + raw * alpha;
    }
  }

  /**
   * Band-energy sine ribbons: spectrum bins only drive amplitude; shape is synthesised
   * so the trace reads as calm layered waves rather than a second oscilloscope.
   */
  private traceWaves(context: CanvasRenderingContext2D, width: number, height: number) {
    const analyser = this.analyser!;
    const bins = this.frequencies!;
    analyser.getByteFrequencyData(bins);
    const usable = Math.max(8, Math.floor(bins.length * 0.7));
    const lineCount = WAVE_CYCLES.length;
    if (!this.waveLevels || this.waveLevels.length !== lineCount) {
      this.waveLevels = new Float32Array(lineCount);
    }
    const levels = this.waveLevels;
    const smooth = AudioVisualizer.WAVES_LEVEL_SMOOTH;
    let energySum = 0;
    for (let i = 0; i < lineCount; i += 1) {
      const lo = Math.floor(WAVE_BANDS[i]! * usable);
      const hi = Math.max(lo + 1, Math.floor(WAVE_BANDS[i + 1]! * usable));
      let sum = 0;
      for (let b = lo; b < hi; b += 1) sum += bins[b]!;
      const energy = sum / ((hi - lo) * 255);
      levels[i] = levels[i]! * (1 - smooth) + energy * smooth;
      energySum += levels[i]!;
    }
    // Advance phase with a quiet base drift plus a boost from loud frames.
    this.wavePhase += 0.012 + energySum * 0.022;

    const center = height / 2;
    const half = (height / 2) * AudioVisualizer.WAVES_HEIGHT;
    const step = AudioVisualizer.WAVES_STEP;
    for (let i = 0; i < lineCount; i += 1) {
      const amplitude = levels[i]! * half;
      const offset = WAVE_OFFSETS[i]! * half;
      const cycles = WAVE_CYCLES[i]!;
      const phase = this.wavePhase * (0.7 + i * 0.15) + i * 1.1;
      context.beginPath();
      context.globalAlpha = WAVE_ALPHAS[i]!;
      for (let x = 0; x < width; x += step) {
        const y = this.waveY(x, width, center, offset, amplitude, cycles, phase);
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      if (width > 1 && (width - 1) % step !== 0) {
        context.lineTo(width - 1, this.waveY(width - 1, width, center, offset, amplitude, cycles, phase));
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  private waveY(
    x: number,
    width: number,
    center: number,
    offset: number,
    amplitude: number,
    cycles: number,
    phase: number,
  ) {
    const t = width > 1 ? x / (width - 1) : 0;
    return (
      center +
      offset +
      amplitude * Math.sin(Math.PI * 2 * cycles * t + phase) +
      0.25 * amplitude * Math.sin(Math.PI * 2 * 2 * cycles * t + phase * 1.3)
    );
  }

  private traceResting(context: CanvasRenderingContext2D, width: number, height: number) {
    const y = this.mode === "spectrum" ? height - this.lineWidth : height / 2;
    context.moveTo(0, y);
    context.lineTo(width, y);
  }

  private readStroke() {
    const color = getComputedStyle(this.canvas).color;
    if (color) this.stroke = color;
  }
}
