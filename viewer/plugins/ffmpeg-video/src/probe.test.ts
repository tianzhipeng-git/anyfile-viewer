import { readFile } from "node:fs/promises";
import { describe, it, expect, vi } from "vitest";
import { probeFfmpegVideo } from "./probe";
import { ffmpegVideoViewer } from "./index";
const fixture = async (name: string) => new File([await readFile(`../../../tools/ffmpeg-playback-build/examples/${name}`)], name);
describe("AVI routing", () => {
  it.each(["avi-mpeg4-mp3.avi", "avi-video-only.avi", "avi-1080p.avi"])("identifies %s with bounded slices", async name => {
    const file = await fixture(name); const whole = vi.spyOn(file, "arrayBuffer");
    expect(await probeFfmpegVideo({ file, signal: new AbortController().signal })).toBe(3);
    expect(whole).not.toHaveBeenCalled();
  });
  it.each(["unknown-codec.avi", "oversized.avi", "corrupt.avi", "truncated.avi", "aiff-s16.aiff", "ps-mpeg2-ac3.vob"])("rejects %s", async name => {
    expect(await probeFfmpegVideo({ file: await fixture(name), signal: new AbortController().signal })).toBe(0);
  });
  it("aborts before reading", async () => { await expect(probeFfmpegVideo({ file: await fixture("avi-video-only.avi"), signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" }); });
  it("rejects malformed files without creating DOM", async () => {
    const container = document.createElement("div");
    await expect(ffmpegVideoViewer.open({ file: new File(["invalid"], "test.avi"), signal: new AbortController().signal, container, locale: "en", reportProgress() {} })).rejects.toMatchObject({ code: "invalid-file" });
    expect(container.childElementCount).toBe(0);
  });
});
