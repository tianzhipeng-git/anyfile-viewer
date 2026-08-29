import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDeferredFile } from "@anyfile/viewer-test";

import { inspectVideoFile } from "./inspect";
import { probeBrowserVideo } from "./probe";

function fixture(name: string) {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
  return new File([bytes], name);
}

function mutatedFixture(name: string, from: string, to: string) {
  if (from.length !== to.length) throw new Error("mutation must preserve byte length");
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
  const source = new TextEncoder().encode(from);
  const replacement = new TextEncoder().encode(to);
  let replacements = 0;
  for (let offset = 0; offset + source.length <= bytes.length; offset += 1) {
    if (!source.every((value, index) => bytes[offset + index] === value)) continue;
    bytes.set(replacement, offset);
    replacements += 1;
  }
  if (replacements === 0) throw new Error(`missing mutation source: ${from}`);
  return new File([bytes], name);
}

function context(file: File, signal = new AbortController().signal) {
  return { file, signal };
}

describe("browser video probe", () => {
  it.each([
    ["mp4-avc-aac-faststart.mp4", "video/mp4", "avc1.42c01e", "mp4a.40.2"],
    ["mp4-avc-aac-tail-moov.mp4", "video/mp4", "avc1.42c01e", "mp4a.40.2"],
    ["mp4-avc-video-only.mp4", "video/mp4", "avc1.42c01e", undefined],
    ["webm-vp8-vorbis.webm", "video/webm", "vp8", "vorbis"],
    ["webm-vp9-opus.webm", "video/webm", "vp9", "opus"],
    ["webm-vp9-video-only.webm", "video/webm", "vp9", undefined],
    ["mp4-hevc-aac.mp4", "video/mp4", "hvc1", "mp4a.40.2"],
    ["mp4-av1-aac.mp4", "video/mp4", "av01.0.00M.08", "mp4a.40.2"],
    ["mov-avc-aac.mov", "video/quicktime", "avc1.42c01e", "mp4a.40.2"],
    ["3gp-avc-aac.3gp", "video/3gpp", "avc1.42c00d", "mp4a.40.2"],
  ])("accepts the fixed playable combination %s", async (name, mimeType, videoCodec, audioCodec) => {
    const file = fixture(name);
    const directRead = vi.spyOn(file, "arrayBuffer");
    const inspection = await inspectVideoFile(context(file));
    expect(inspection).toMatchObject({ mimeType, codecsSupported: true });
    expect(inspection?.videoTracks[0]?.codecString).toBe(videoCodec);
    expect(inspection?.audioTracks[0]?.codecString).toBe(audioCodec);
    expect(await probeBrowserVideo(context(file))).toBe(3);
    expect(directRead).not.toHaveBeenCalled();
  });

  it.each([
    "mp4-aac-audio-only.mp4",
    "webm-opus-audio-only.webm",
    "corrupt.mp4",
    "truncated.mp4",
    "corrupt.webm",
    "truncated.webm",
    "corrupt.mov",
    "truncated.mov",
    "corrupt.3gp",
    "truncated.3gp",
    "disguised-webm.mp4",
    "disguised-mp4.webm",
    "disguised-webm.mov",
    "disguised-webm.3gp",
  ])("rejects audio-only, invalid, truncated, or disguised fixture %s", async (name) => {
    expect(await probeBrowserVideo(context(fixture(name)))).toBe(0);
  });

  it("does not create DOM elements while probing", async () => {
    const createElement = vi.spyOn(document, "createElement");
    const file = fixture("mp4-avc-aac-faststart.mp4");

    expect(await probeBrowserVideo(context(file))).toBe(3);
    expect(createElement).not.toHaveBeenCalled();
  });

  it("rejects structurally valid codec combinations outside the declared subset", async () => {
    const webmAv1Vorbis = mutatedFixture("webm-vp8-vorbis.webm", "V_VP8", "V_AV1");
    const hevcVideoOnly = mutatedFixture("mp4-avc-video-only.mp4", "avc1", "hvc1");

    expect(await probeBrowserVideo(context(webmAv1Vorbis))).toBe(0);
    expect(await probeBrowserVideo(context(hevcVideoOnly))).toBe(0);
  });

  it("cancels an in-flight bounded read", async () => {
    const deferred = createDeferredFile("delayed.mp4", 1024);
    const abortController = new AbortController();
    const probing = probeBrowserVideo(context(deferred.file, abortController.signal));
    abortController.abort();

    await expect(probing).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
  });
});
