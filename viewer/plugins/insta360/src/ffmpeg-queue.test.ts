import { describe, expect, it } from "vitest";
import type { DecodedFrame } from "@anyfile/ffmpeg-playback/client";
import { PanoramaFrameQueue } from "./ffmpeg-queue";
const video = (lens: 0 | 1, timestamp = 0): DecodedFrame => ({
  kind: "video", lens, timestamp, duration: 1 / 30, width: 1920, height: 1920,
  sampleRate: 0, channels: 0, samples: 0, data: new ArrayBuffer(1920 * 1920 * 1.5),
});
const audio = (timestamp = 0): DecodedFrame => ({ kind: "audio", timestamp, duration: 0.02,
  width: 0, height: 0, sampleRate: 48000, channels: 2, samples: 960, data: new ArrayBuffer(960 * 2 * 4) });
describe("panorama playback queue", () => {
  it("only advances coverage when both lenses and audio are decoded", () => {
    const queue = new PanoramaFrameQueue(2, 48000, 2);
    queue.push(video(0)); queue.push(audio()); expect(queue.end).toBe(0);
    queue.push(video(1)); expect(queue.end).toBe(0.02);
    queue.push(audio(0.02)); expect(queue.end).toBeCloseTo(1 / 30);
  });
  it("rejects a backwards lens timeline and malformed output", () => {
    const queue = new PanoramaFrameQueue(2, 48000, 2);
    queue.push(video(0, 1));
    expect(() => queue.push(video(0, 0))).toThrow();
    expect(() => queue.push({ ...video(1), width: 3840 })).toThrow();
    expect(() => queue.push({ ...audio(), samples: 1 })).toThrow();
    expect(() => queue.push({ ...video(1), lens: undefined })).toThrow();
  });
  it("bounds unbalanced tracks and releases byte accounting when frames leave", () => {
    const queue = new PanoramaFrameQueue(2, 48000, 2);
    for (let i = 0; i < 48; i++) queue.push(video(0, i / 30));
    expect(queue.full).toBe(true);
    expect(() => queue.push(video(0, 48 / 30))).toThrow();
    queue.shift(0); expect(queue.full).toBe(false);
    queue.push(video(0, 48 / 30));
  });
});
