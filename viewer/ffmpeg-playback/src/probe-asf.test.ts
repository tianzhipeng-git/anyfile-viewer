import { readFile } from "node:fs/promises";
import { describe, it, expect, vi } from "vitest";

import { inspectAsf } from "./probe-asf";

const fixture = async (name: string) => new File([await readFile(`../../tools/ffmpeg-playback-build/examples/${name}`)], name);
const signal = () => new AbortController().signal;

describe("ASF stream inspection", () => {
  it("reads WMV2 video with its WMA2 main audio", async () => {
    const file = await fixture("asf-wmv2-wma2.wmv"); const whole = vi.spyOn(file, "arrayBuffer");
    expect(await inspectAsf({ file, signal: signal() })).toEqual({
      video: { codec: "wmv2", width: 320, height: 240 },
      audio: { codec: "wmav2", channels: 2, sampleRate: 48000 },
    });
    expect(whole).not.toHaveBeenCalled();
  });
  it.each([["asf-wma1.wma", "wmav1"], ["asf-wma2.wma", "wmav2"]] as const)("reads audio-only %s", async (name, codec) => {
    expect(await inspectAsf({ file: await fixture(name), signal: signal() })).toEqual({ video: null, audio: { codec, channels: 2, sampleRate: 48000 } });
  });
  it.each(["asf-multiple-audio.wma", "avi-mpeg4-mp3.avi", "ps-mpeg2-ac3.vob", "corrupt.avi", "truncated.avi"])("rejects %s", async name => {
    expect(await inspectAsf({ file: await fixture(name), signal: signal() })).toBeNull();
  });
  it("aborts before reading", async () => { await expect(inspectAsf({ file: await fixture("asf-wmv2-wma2.wmv"), signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" }); });
});
