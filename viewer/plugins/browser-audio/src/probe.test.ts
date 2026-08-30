import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDeferredFile } from "@anyfile/viewer-test";

import { inspectBrowserAudioFile } from "./inspect";
import { probeBrowserAudio } from "./probe";

function fixture(name: string) {
  return new File([new Uint8Array(readFileSync(join(process.cwd(), "examples", name)))], name);
}

function context(file: File, signal = new AbortController().signal) { return { file, signal }; }

describe("browser audio probe", () => {
  it("accepts large FLAC padding within the bounded probe head", async () => {
    const source = new Uint8Array(readFileSync(join(process.cwd(), "examples", "flac-24.flac")));
    const streamInfo = source.slice(4, 42);
    streamInfo[0] &= 0x7f;
    const paddingSize = 192 * 1024;
    const paddingHeader = new Uint8Array([
      0x81,
      paddingSize >> 16,
      paddingSize >> 8 & 0xff,
      paddingSize & 0xff,
    ]);
    const file = new File([
      new Uint8Array([0x66, 0x4c, 0x61, 0x43]),
      streamInfo,
      paddingHeader,
      new Uint8Array(paddingSize),
      new Uint8Array([0xff]),
    ], "padded.flac");

    expect(await probeBrowserAudio(context(file))).toBe(3);
  });

  it.each([
    ["mp3-cbr.mp3", "MP3", "MP3"],
    ["mp3-vbr-xing.mp3", "MP3", "MP3"],
    ["mp3-id3-apic.mp3", "MP3", "MP3"],
    ["wave-s16le.wav", "WAVE", "PCM S16LE"],
    ["wave-s24le.wav", "WAVE", "PCM S24LE"],
    ["wave-f32le.wav", "WAVE", "PCM F32LE"],
    ["m4a-aac-lc.m4a", "MPEG-4", "AAC-LC"],
    ["ogg-vorbis.ogg", "Ogg", "Vorbis"],
    ["ogg-opus.opus", "Ogg", "Opus"],
    ["webm-opus.webm", "WebM", "Opus"],
    ["webm-vorbis.webm", "WebM", "Vorbis"],
    ["flac-16.flac", "FLAC", "FLAC"],
    ["flac-24.flac", "FLAC", "FLAC"],
    ["flac-picture.flac", "FLAC", "FLAC"],
    ["adts-aac-lc.aac", "ADTS", "AAC-LC"],
  ])("accepts fixed playable fixture %s", async (name, container, codec) => {
    const file = fixture(name);
    const directRead = vi.spyOn(file, "arrayBuffer");
    expect(await inspectBrowserAudioFile(context(file))).toMatchObject({ container, codec });
    expect(await probeBrowserAudio(context(file))).toBe(3);
    expect(directRead).not.toHaveBeenCalled();
  });

  it.each(["wave-adpcm-unsupported.wav", "m4a-alac-unsupported.m4a", "adts-main-unsupported.aac", "mp4-video.mp4", "webm-video.webm", "ogg-theora-video.ogg", "corrupt.mp3", "truncated.mp3", "disguised.mp3", "oversized-id3.mp3"])
    ("rejects unsupported, video, invalid, truncated, disguised, or over-limit fixture %s", async (name) => {
      expect(await probeBrowserAudio(context(fixture(name)))).toBe(0);
    });

  it("does not create DOM or media objects while probing", async () => {
    const createElement = vi.spyOn(document, "createElement");
    expect(await probeBrowserAudio(context(fixture("mp3-cbr.mp3")))).toBe(3);
    expect(createElement).not.toHaveBeenCalled();
  });

  it("cancels an in-flight bounded read", async () => {
    const deferred = createDeferredFile("delayed.mp3", 1024);
    const abortController = new AbortController();
    const probing = probeBrowserAudio(context(deferred.file, abortController.signal));
    abortController.abort();
    await expect(probing).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
  });
});
