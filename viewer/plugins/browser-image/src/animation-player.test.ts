import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimationPlayer } from "./animation-player";
import type { FrameDecoder } from "./animation-decoder";

function setup(repetitionCount = 0, duration: number | null = 100000) {
  vi.useFakeTimers();
  const close = vi.fn();
  const decoder = { decode: vi.fn(async () => ({ image: { duration, close } as unknown as VideoFrame })) } as unknown as FrameDecoder;
  const draw = vi.fn(), changed = vi.fn(), failed = vi.fn();
  const player = new AnimationPlayer(decoder, 3, repetitionCount, draw, changed, failed);
  return { player, decoder, close, draw, changed, failed };
}
afterEach(() => vi.useRealTimers());

describe("animation scheduling", () => {
  it("holds the final frame for its duration and stops after the declared total plays", async () => {
    const { player, decoder, close } = setup(1);
    await player.initialize();
    player.play();
    await vi.advanceTimersByTimeAsync(599);
    expect(player.state).toMatchObject({ index: 2, playing: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(player.state).toMatchObject({ index: 2, playing: false, ended: true });
    expect(vi.mocked(decoder.decode).mock.calls.map(([o]) => o.frameIndex)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(close).toHaveBeenCalledTimes(6);
    player.play();
    await vi.advanceTimersByTimeAsync(0);
    expect(player.state).toMatchObject({ index: 0, playing: true, ended: false });
    player.dispose();
  });
  it("pauses, steps backwards and resumes from the selected frame", async () => {
    const { player, decoder } = setup(Infinity);
    await player.initialize(); player.play();
    await vi.advanceTimersByTimeAsync(200);
    player.pause();
    await vi.advanceTimersByTimeAsync(1000);
    expect(player.state.index).toBe(2);
    player.step(-1);
    await vi.advanceTimersByTimeAsync(0);
    expect(player.state).toMatchObject({ index: 1, playing: false });
    player.play();
    await vi.advanceTimersByTimeAsync(100);
    expect(player.state.index).toBe(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(player.state.index).toBe(0);
    player.dispose(); player.dispose();
    const calls = vi.mocked(decoder.decode).mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(decoder.decode).toHaveBeenCalledTimes(calls);
  });
  it("discards a decode that finishes after pause or disposal and still closes the frame", async () => {
    const { player, decoder, draw, close, changed } = setup(Infinity);
    await player.initialize();
    let finish!: (value: { image: VideoFrame }) => void;
    vi.mocked(decoder.decode).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    player.play();
    await vi.advanceTimersByTimeAsync(100);
    player.pause(); player.dispose();
    changed.mockClear();
    finish({ image: { duration: 100000, close } as unknown as VideoFrame });
    await vi.advanceTimersByTimeAsync(0);
    expect(draw).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledTimes(2);
    expect(changed).not.toHaveBeenCalled();
  });
  it("does not invent a duration for missing timing and keeps stepping available", async () => {
    const { player } = setup(0, null);
    await player.initialize(); player.play();
    expect(player.state.playing).toBe(false);
    player.step(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(player.state).toMatchObject({ index: 1, duration: null });
    player.dispose();
  });
  it("changes speed mid-frame without changing decoded timing or adding duplicate timers", async () => {
    const { player, decoder } = setup();
    await player.initialize(); player.play();
    await vi.advanceTimersByTimeAsync(50);
    player.setRate(2);
    await vi.advanceTimersByTimeAsync(24);
    expect(player.state.index).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(player.state).toMatchObject({ index: 1, duration: 100, rate: 2 });
    await vi.advanceTimersByTimeAsync(100);
    expect(player.state).toMatchObject({ index: 2, ended: true, playing: false });
    expect(decoder.decode).toHaveBeenCalledTimes(3);
    player.dispose();
  });
  it("keeps a changed speed while paused, stepping and replaying a finished animation", async () => {
    const { player } = setup();
    await player.initialize(); player.setRate(0.25);
    await vi.advanceTimersByTimeAsync(1000);
    expect(player.state).toMatchObject({ index: 0, playing: false });
    player.step(1);
    await vi.advanceTimersByTimeAsync(0);
    player.play();
    await vi.advanceTimersByTimeAsync(399);
    expect(player.state.index).toBe(1);
    await vi.advanceTimersByTimeAsync(401);
    expect(player.state).toMatchObject({ index: 2, ended: true });
    player.play();
    await vi.advanceTimersByTimeAsync(0);
    expect(player.state).toMatchObject({ index: 0, playing: true, rate: 0.25 });
    player.dispose();
  });
  it("does not start another decode when speed changes during an outstanding decode", async () => {
    const { player, decoder, close } = setup();
    await player.initialize();
    let finish!: (value: { image: VideoFrame }) => void;
    vi.mocked(decoder.decode).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    player.play();
    await vi.advanceTimersByTimeAsync(100);
    player.setRate(4);
    expect(decoder.decode).toHaveBeenCalledTimes(2);
    finish({ image: { duration: 100000, close } as unknown as VideoFrame });
    await vi.advanceTimersByTimeAsync(24);
    expect(player.state.index).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(player.state.index).toBe(2);
    player.dispose();
  });
  it("stops scheduling and reports active decoding failures", async () => {
    const { player, decoder, failed } = setup();
    await player.initialize();
    vi.mocked(decoder.decode).mockRejectedValueOnce(new Error("bad frame"));
    player.play();
    await vi.advanceTimersByTimeAsync(1000);
    expect(failed).toHaveBeenCalledOnce();
    expect(player.state.playing).toBe(false);
    player.dispose();
  });
});
