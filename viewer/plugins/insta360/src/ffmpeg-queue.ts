import { ViewerError } from "@anyfile/viewer-protocol";
import type { DecodedFrame } from "@anyfile/ffmpeg-playback/client";

// A 0.5 s stereo I420 preroll needs about 159 MiB at 30 fps.
const MAX_BYTES = 256 * 1024 * 1024;
/** Three bounded timelines, kept until presented so buffering can reschedule PCM. */
export class PanoramaFrameQueue {
  readonly tracks: [DecodedFrame[], DecodedFrame[], DecodedFrame[]] = [[], [], []];
  readonly ends = [0, 0, 0];
  #bytes = 0;
  #last = [-Infinity, -Infinity, -Infinity];
  constructor(readonly duration: number, readonly rate: number, readonly channels: number) {}
  get end() { return Math.min(...this.ends); }
  get full() { return this.#bytes > MAX_BYTES - 1920 * 1920 * 1.5; }
  get firstFrames() { return [this.tracks[0][0], this.tracks[1][0]] as const; }
  push(frame: DecodedFrame) {
    const slot = frame.kind === "audio" ? 2 : frame.lens;
    if (slot !== 0 && slot !== 1 && slot !== 2) throw new ViewerError("invalid-file", "Missing lens identity.");
    if (!Number.isFinite(frame.timestamp) || !Number.isFinite(frame.duration) || frame.duration <= 0
      || frame.duration > 1 || frame.timestamp < this.#last[slot] - 0.001 || frame.timestamp > this.duration + 0.1) {
      throw new ViewerError("invalid-file", "Invalid panorama timeline.");
    }
    if (frame.kind === "video" ? frame.width !== 1920 || frame.height !== 1920 || frame.data.byteLength !== 1920 * 1920 * 1.5
      : frame.sampleRate !== this.rate || frame.channels !== this.channels || frame.samples * frame.channels * 4 !== frame.data.byteLength) {
      throw new ViewerError("invalid-file", "Invalid panorama frame.");
    }
    if (this.#bytes + frame.data.byteLength > MAX_BYTES || this.tracks[slot].length >= 128) {
      throw new ViewerError("resource-limit", "Panorama queue exceeded its budget.");
    }
    this.#last[slot] = frame.timestamp;
    this.ends[slot] = frame.timestamp + frame.duration;
    this.tracks[slot].push(frame); this.#bytes += frame.data.byteLength;
  }
  shift(slot: number) {
    const frame = this.tracks[slot].shift();
    if (frame) this.#bytes -= frame.data.byteLength;
    return frame;
  }
}
