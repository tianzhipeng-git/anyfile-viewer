import { readFile } from "node:fs/promises";
import { describe, it, expect, vi } from "vitest";
import { probeFfmpegAudio } from "./probe";
import { ffmpegAudioViewer } from "./index";
const fixture = async (name: string) => new File([await readFile(`../../../tools/ffmpeg-playback-build/examples/${name}`)], name);
describe("AIFF/AIFC routing", () => {
  it.each(["aiff-s16.aiff", "aiff-s24.aiff", "aifc-f32.aifc", "aiff-silence.aiff"])("identifies %s with bounded slices", async name => {
    const file = await fixture(name); const whole = vi.spyOn(file, "arrayBuffer");
    expect(await probeFfmpegAudio({ file, signal: new AbortController().signal })).toBe(3);
    expect(whole).not.toHaveBeenCalled();
  });
  it.each(["asf-wma2.wma", "avi-mpeg4-mp3.avi", "corrupt.avi", "truncated.avi"])("rejects %s", async name => {
    expect(await probeFfmpegAudio({ file: await fixture(name), signal: new AbortController().signal })).toBe(0);
  });
  it("aborts before reading", async () => { await expect(probeFfmpegAudio({ file: await fixture("aiff-s16.aiff"), signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" }); });
  it("rejects malformed files before runtime initialization", async () => {
    const container = document.createElement("div");
    await expect(ffmpegAudioViewer.open({ file: new File(["invalid"], "test.aiff"), signal: new AbortController().signal, container, locale: "en", reportProgress() {} })).rejects.toMatchObject({ code: "invalid-file" });
    expect(container.childElementCount).toBe(0);
  });
});
