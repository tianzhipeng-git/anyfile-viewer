import { readFile } from "node:fs/promises";
import { describe, it, expect, vi } from "vitest";
import { inspectAudio, probeFfmpegAudio } from "./probe";
import { ffmpegAudioViewer } from "./index";
const fixture = async (name: string) => new File([await readFile(`../../../tools/ffmpeg-playback-build/examples/${name}`)], name);
describe("FFmpeg audio routing", () => {
  it.each(["aiff-s16.aiff", "aiff-s24.aiff", "aifc-f32.aifc", "aiff-silence.aiff", "asf-wma1.wma", "asf-wma2.wma"])("identifies %s with bounded slices", async name => {
    const file = await fixture(name); const whole = vi.spyOn(file, "arrayBuffer");
    expect(await probeFfmpegAudio({ file, signal: new AbortController().signal })).toBe(3);
    expect(whole).not.toHaveBeenCalled();
  });
  it("reports the ASF audio stream used by the open cross-check", async () => {
    expect(await inspectAudio({ file: await fixture("asf-wma2.wma"), signal: new AbortController().signal }))
      .toEqual({ container: "asf", codec: "wmav2", channels: 2, sampleRate: 48000 });
  });
  it.each(["asf-wmv2-wma2.wmv", "asf-multiple-audio.wma", "avi-mpeg4-mp3.avi", "corrupt.avi", "truncated.avi"])("rejects %s", async name => {
    expect(await probeFfmpegAudio({ file: await fixture(name), signal: new AbortController().signal })).toBe(0);
  });
  it("aborts before reading", async () => { await expect(probeFfmpegAudio({ file: await fixture("aiff-s16.aiff"), signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" }); });
  it("rejects malformed files before runtime initialization", async () => {
    const container = document.createElement("div");
    for (const name of ["test.aiff", "test.wma"]) await expect(ffmpegAudioViewer.open({ file: new File(["invalid"], name), signal: new AbortController().signal, container, locale: "en", reportProgress() {} })).rejects.toMatchObject({ code: "invalid-file" });
    expect(container.childElementCount).toBe(0);
  });
});
