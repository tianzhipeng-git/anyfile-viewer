import { readFile } from "node:fs/promises";
import { describe, it, expect, vi } from "vitest";
import { inspectVideo, probeFfmpegVideo } from "./probe";
import { ffmpegVideoViewer } from "./index";
const fixture = async (name: string) => new File([await readFile(`../../../tools/ffmpeg-playback-build/examples/${name}`)], name);
const signal = () => new AbortController().signal;
describe("FFmpeg video routing", () => {
  it.each(["avi-mpeg4-mp3.avi", "avi-video-only.avi", "avi-1080p.avi", "asf-wmv2-wma2.wmv", "ps-mpeg2-ac3.vob", "ps-mpeg2-mp2.mpg"])("identifies %s with bounded slices", async name => {
    const file = await fixture(name); const whole = vi.spyOn(file, "arrayBuffer");
    expect(await probeFfmpegVideo({ file, signal: signal() })).toBe(3);
    expect(whole).not.toHaveBeenCalled();
  });
  it("reads the declared main tracks from each container", async () => {
    expect(await inspectVideo({ file: await fixture("avi-mpeg4-mp3.avi"), signal: signal() }))
      .toMatchObject({ container: "avi", videoCodec: "mpeg4", audio: true, audioCodec: "mp3" });
    expect(await inspectVideo({ file: await fixture("asf-wmv2-wma2.wmv"), signal: signal() }))
      .toMatchObject({ container: "asf", videoCodec: "wmv2", width: 320, height: 240, audio: true, audioCodec: "wmav2", channels: 2, sampleRate: 48000 });
    expect(await inspectVideo({ file: await fixture("ps-mpeg2-ac3.vob"), signal: signal() }))
      .toMatchObject({ container: "mpeg-ps", videoCodec: "mpeg2video", width: 320, height: 240, audio: true, audioCodec: "ac3", channels: 2, sampleRate: 48000 });
    expect(await inspectVideo({ file: await fixture("ps-mpeg2-mp2.mpg"), signal: signal() }))
      .toMatchObject({ container: "mpeg-ps", videoCodec: "mpeg2video", audio: true, audioCodec: "mp2", channels: 2, sampleRate: 48000 });
  });
  it.each([
    "unknown-codec.avi", "oversized.avi", "corrupt.avi", "truncated.avi", "aiff-s16.aiff", "asf-wma1.wma",
    "asf-wma2.wma", "asf-multiple-audio.wma", "mp3-cover.mp3", "aifc-f32.aifc",
  ])("rejects %s", async name => {
    expect(await probeFfmpegVideo({ file: await fixture(name), signal: signal() })).toBe(0);
  });
  it("aborts before reading", async () => { await expect(probeFfmpegVideo({ file: await fixture("avi-video-only.avi"), signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" }); });
  it("rejects malformed files without creating DOM", async () => {
    const container = document.createElement("div");
    await expect(ffmpegVideoViewer.open({ file: new File(["invalid"], "test.avi"), signal: signal(), container, locale: "en", reportProgress() {} })).rejects.toMatchObject({ code: "invalid-file" });
    expect(container.childElementCount).toBe(0);
  });
});
