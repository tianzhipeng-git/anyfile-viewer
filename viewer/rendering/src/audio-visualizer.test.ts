import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioVisualizer } from "./audio-visualizer";

let resumeResult: AudioContextState = "running";
let reducedMotion = false;
const contexts: FakeAudioContext[] = [];

class FakeAnalyserNode {
  fftSize = 2048;
  smoothingTimeConstant = 0;
  readonly frequencyBinCount = 1024;
  readonly disconnect = vi.fn();
  constructor(readonly context: FakeAudioContext) {}
  getByteFrequencyData(array: Uint8Array) { array.fill(120); }
  getFloatTimeDomainData(array: Float32Array) { array.fill(0.2); }
}

class FakeMediaSource {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  constructor(readonly context: FakeAudioContext, readonly element: HTMLMediaElement) {}
}

class FakeAudioContext {
  state: AudioContextState = "suspended";
  readonly destination = { name: "destination" };
  readonly resume = vi.fn(async () => { this.state = resumeResult; });
  readonly close = vi.fn(async () => { this.state = "closed"; });
  readonly createAnalyser = vi.fn(() => new FakeAnalyserNode(this));
  readonly createMediaElementSource = vi.fn((element: HTMLMediaElement) => new FakeMediaSource(this, element));
  constructor(readonly options?: AudioContextOptions) { contexts.push(this); }
}

const pending = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

function flush(count = 1) {
  for (let index = 0; index < count; index += 1) {
    const queued = [...pending.values()];
    pending.clear();
    for (const callback of queued) callback(16);
  }
}

function surface2d() {
  return {
    clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), setTransform: vi.fn(),
    strokeStyle: "", lineWidth: 1, lineJoin: "", lineCap: "", globalAlpha: 1,
  };
}

function canvas(context: ReturnType<typeof surface2d>) {
  const element = document.createElement("canvas");
  Object.defineProperty(element, "clientWidth", { configurable: true, value: 320 });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: 72 });
  vi.spyOn(element, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  return element;
}

function nodeTap(context: FakeAudioContext) {
  return {
    context,
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as AudioNode & { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  contexts.splice(0);
  resumeResult = "running";
  reducedMotion = false;
  pending.clear();
  nextFrame = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { pending.delete(id); });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reducedMotion, media: query }));
});

afterEach(() => {
  Reflect.deleteProperty(window, "devicePixelRatio");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AudioVisualizer", () => {
  it("taps a caller-owned graph without closing its context", () => {
    const drawn = surface2d();
    const context = new FakeAudioContext();
    const node = nodeTap(context);
    const visualizer = new AudioVisualizer(canvas(drawn));
    visualizer.attach({ kind: "node", node });
    visualizer.setActive(true);
    flush(3);

    const analyser = context.createAnalyser.mock.results[0]!.value as FakeAnalyserNode;
    expect(node.connect).toHaveBeenCalledWith(analyser);
    expect(analyser.fftSize).toBe(2048);
    expect(analyser.smoothingTimeConstant).toBe(0.72);
    expect(drawn.clearRect).toHaveBeenCalledTimes(3);
    expect(drawn.stroke).toHaveBeenCalledTimes(3);
    expect(pending.size).toBe(1);

    visualizer.dispose();
    expect(node.disconnect).toHaveBeenCalledWith(analyser);
    expect(analyser.disconnect).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
  });

  it("builds the media graph only after the context is confirmed running", async () => {
    const drawn = surface2d();
    const audio = document.createElement("audio");
    const visualizer = new AudioVisualizer(canvas(drawn));
    visualizer.attach({ kind: "media", element: audio });
    flush(1);
    expect(contexts).toHaveLength(0);

    audio.dispatchEvent(new Event("play"));
    await vi.waitFor(() => expect(contexts).toHaveLength(1));
    const context = contexts[0]!;
    expect(context.resume).toHaveBeenCalledOnce();
    const source = context.createMediaElementSource.mock.results[0]!.value as FakeMediaSource;
    // The audible path must be connected before the analyser side branch.
    expect(source.connect.mock.calls[0]![0]).toBe(context.destination);
    expect(source.connect.mock.calls[1]![0]).toBe(context.createAnalyser.mock.results[0]!.value);
    expect(pending.size).toBe(1);

    visualizer.dispose();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    visualizer.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("never takes over a native element while the context stays suspended", async () => {
    resumeResult = "suspended";
    const audio = document.createElement("audio");
    const visualizer = new AudioVisualizer(canvas(surface2d()));
    visualizer.attach({ kind: "media", element: audio });
    audio.dispatchEvent(new Event("play"));
    await vi.waitFor(() => expect(contexts).toHaveLength(1));
    flush(2);

    expect(contexts[0]!.createMediaElementSource).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(contexts[0]!.close).toHaveBeenCalledOnce());
    visualizer.dispose();
  });

  it("stops the loop when inactive", () => {
    const drawn = surface2d();
    const context = new FakeAudioContext();
    const visualizer = new AudioVisualizer(canvas(drawn));
    visualizer.attach({ kind: "node", node: nodeTap(context) });

    visualizer.setActive(true);
    flush(2);
    expect(pending.size).toBe(1);

    visualizer.setActive(false);
    flush(1);
    expect(pending.size).toBe(0);
    flush(3);
    expect(drawn.clearRect).toHaveBeenCalledTimes(3);
    visualizer.dispose();
  });

  it("keeps one resting frame while no tap is attached", () => {
    const drawn = surface2d();
    const visualizer = new AudioVisualizer(canvas(drawn));
    visualizer.setActive(true);
    flush(2);

    expect(pending.size).toBe(0);
    expect(drawn.moveTo).toHaveBeenCalledWith(0, 72 - 1.5);
    expect(drawn.lineTo).toHaveBeenCalledWith(320, 72 - 1.5);
    visualizer.dispose();
  });

  it("stops painting after dispose", () => {
    const drawn = surface2d();
    const visualizer = new AudioVisualizer(canvas(drawn));
    visualizer.setActive(true);
    flush(1);
    const painted = drawn.clearRect.mock.calls.length;
    visualizer.dispose();
    flush(3);
    expect(drawn.clearRect).toHaveBeenCalledTimes(painted);
  });

  it("skips unlaid-out canvases instead of allocating a fallback surface", () => {
    const drawn = surface2d();
    const element = canvas(drawn);
    Object.defineProperty(element, "clientWidth", { configurable: true, value: 0 });
    const visualizer = new AudioVisualizer(element);
    visualizer.setActive(true);
    flush(2);
    expect(drawn.clearRect).not.toHaveBeenCalled();
    visualizer.dispose();
  });

  it("scales CSS-space coordinates by the device pixel ratio", () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    const drawn = surface2d();
    const element = canvas(drawn);
    const visualizer = new AudioVisualizer(element);
    flush(1);

    // The backing store is 640x144 device pixels while drawing stays in CSS space.
    expect(element.width).toBe(640);
    expect(element.height).toBe(144);
    expect(drawn.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(drawn.clearRect).toHaveBeenCalledWith(0, 0, 320, 72);
    visualizer.dispose();
  });

  it("keeps a static line and no audio graph under reduced motion", () => {
    reducedMotion = true;
    const drawn = surface2d();
    const audio = document.createElement("audio");
    const visualizer = new AudioVisualizer(canvas(drawn), { mode: "waveform" });
    visualizer.attach({ kind: "media", element: audio });
    audio.dispatchEvent(new Event("play"));
    visualizer.setActive(true);
    flush(3);

    expect(contexts).toHaveLength(0);
    expect(pending.size).toBe(0);
    expect(drawn.moveTo).toHaveBeenCalledWith(0, 36);
    visualizer.dispose();
  });

  it("cycles the resting effect on canvas click without starting a loop", () => {
    const drawn = surface2d();
    const element = canvas(drawn);
    const visualizer = new AudioVisualizer(element);
    flush(1);
    expect(drawn.moveTo).toHaveBeenLastCalledWith(0, 72 - 1.5);

    // spectrum → waveform (midline)
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flush(1);
    expect(drawn.moveTo).toHaveBeenLastCalledWith(0, 36);
    expect(pending.size).toBe(0);

    // waveform → waves (still midline)
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flush(1);
    expect(drawn.moveTo).toHaveBeenLastCalledWith(0, 36);

    // waves → spectrum (baseline)
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flush(1);
    expect(drawn.moveTo).toHaveBeenLastCalledWith(0, 72 - 1.5);
    visualizer.dispose();
  });

  it("phase-locks waveform draws to a rising zero crossing", () => {
    const drawn = surface2d();
    const context = new FakeAudioContext();
    const visualizer = new AudioVisualizer(canvas(drawn), { mode: "waveform" });
    visualizer.attach({ kind: "node", node: nodeTap(context) });
    const analyser = context.createAnalyser.mock.results[0]!.value as FakeAnalyserNode;
    analyser.getFloatTimeDomainData = (array: Float32Array) => {
      array.fill(0.4);
      // Rising edge at index 40; columns should sample from there, not from 0.
      array[39] = -0.2;
      array[40] = 0.1;
    };
    visualizer.setActive(true);
    flush(1);

    const [x, y] = drawn.moveTo.mock.calls[0] as [number, number];
    expect(x).toBe(0);
    // Drawn window peaks at 0.4 (fill); sample[40] === 0.1 → 0.1/0.4 of full height.
    const amplitude = (72 / 2) * 0.92;
    expect(y).toBeCloseTo(36 - (0.1 / 0.4) * amplitude, 5);
    visualizer.dispose();
  });

  it("draws layered sine ribbons from band energy in waves mode", () => {
    const drawn = surface2d();
    const context = new FakeAudioContext();
    const visualizer = new AudioVisualizer(canvas(drawn), { mode: "waves" });
    visualizer.attach({ kind: "node", node: nodeTap(context) });
    const analyser = context.createAnalyser.mock.results[0]!.value as FakeAnalyserNode;
    expect(analyser.smoothingTimeConstant).toBe(0.72);
    analyser.getByteFrequencyData = (array: Uint8Array) => {
      array.fill(0);
      // Pump only the lowest band so the first ribbon has non-zero amplitude.
      array.fill(200, 0, 60);
    };
    visualizer.setActive(true);
    flush(1);

    // Four ribbons, each stroked once with increasing opacity.
    expect(drawn.stroke).toHaveBeenCalledTimes(4);
    expect(drawn.globalAlpha).toBe(1);
    const firstY = drawn.moveTo.mock.calls[0]![1] as number;
    // Bass ribbon: offset -0.18 * half, phase starts at i*1.1; with energy the Y leaves center.
    expect(firstY).not.toBe(36);
    visualizer.dispose();
  });

  it("retunes the live analyser and keeps one pending frame across a cycle", () => {
    const element = canvas(surface2d());
    const context = new FakeAudioContext();
    const visualizer = new AudioVisualizer(element);
    visualizer.attach({ kind: "node", node: nodeTap(context) });
    visualizer.setActive(true);
    flush(1);
    const analyser = context.createAnalyser.mock.results[0]!.value as FakeAnalyserNode;
    expect(analyser.smoothingTimeConstant).toBe(0.72);

    // spectrum → waveform
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(analyser.smoothingTimeConstant).toBe(0);
    expect(pending.size).toBe(1);

    // waveform → waves (Analyser smoothing back on)
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(analyser.smoothingTimeConstant).toBe(0.72);
    expect(pending.size).toBe(1);

    // waves → spectrum
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(analyser.smoothingTimeConstant).toBe(0.72);
    expect(pending.size).toBe(1);
    visualizer.dispose();
  });

  it("activates from Enter and Space without scrolling, ignoring other keys", () => {
    const drawn = surface2d();
    const element = canvas(drawn);
    const visualizer = new AudioVisualizer(element);
    flush(1);

    const space = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    element.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    flush(1);
    expect(drawn.moveTo).toHaveBeenLastCalledWith(0, 36);

    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    element.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    flush(1);
    // waveform → waves; resting line stays on the midline.
    expect(drawn.moveTo).toHaveBeenLastCalledWith(0, 36);

    const enterAgain = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    element.dispatchEvent(enterAgain);
    expect(enterAgain.defaultPrevented).toBe(true);
    flush(1);
    expect(drawn.moveTo).toHaveBeenLastCalledWith(0, 72 - 1.5);

    const unrelated = new KeyboardEvent("keydown", { key: "a", cancelable: true });
    element.dispatchEvent(unrelated);
    expect(unrelated.defaultPrevented).toBe(false);
    flush(1);
    expect(drawn.moveTo).toHaveBeenLastCalledWith(0, 72 - 1.5);
    visualizer.dispose();
  });

  it("stops cycling after dispose", () => {
    const drawn = surface2d();
    const element = canvas(drawn);
    const visualizer = new AudioVisualizer(element);
    flush(1);
    const painted = drawn.clearRect.mock.calls.length;
    visualizer.dispose();

    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keydown", { key: " ", cancelable: true }));
    flush(2);
    expect(drawn.clearRect).toHaveBeenCalledTimes(painted);
  });
});
