import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeNonNativeAudio } from "./probe";

function fixture(name: string) {
  return new File([new Uint8Array(readFileSync(join(process.cwd(), "examples", name)))], name);
}
function browserAudioFixture(name: string) {
  return new File(
    [new Uint8Array(readFileSync(join(process.cwd(), "../browser-audio/examples", name)))],
    name,
  );
}
function context(file: File) {
  return { file, signal: new AbortController().signal };
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", class AudioContext {});
  vi.stubGlobal("AudioDecoder", class AudioDecoder {});
});
afterEach(() => vi.unstubAllGlobals());

describe("non-native audio probe", () => {
  it.each(["mka-opus.mka", "mka-vorbis.mka", "mka-flac.mka", "mka-aac.mka", "wave-alaw.wav", "wave-ulaw.wav"])(
    "accepts fixed audio-only fixture %s",
    async (name) => {
      expect(await probeNonNativeAudio(context(fixture(name)))).toBe(3);
    },
  );
  it.each([
    "mka-video-counterexample.mka",
    "corrupt.mka",
    "truncated.mka",
    "wave-adpcm-unsupported.wav",
  ])("rejects video or invalid fixture %s", async (name) => {
    expect(await probeNonNativeAudio(context(fixture(name)))).toBe(0);
  });
  it("rejects native WAVE PCM that belongs to browser-audio", async () => {
    expect(await probeNonNativeAudio(context(browserAudioFixture("wave-s16le.wav")))).toBe(0);
  });
  it("does not load without required browser capabilities", async () => {
    vi.stubGlobal("AudioDecoder", undefined);
    expect(await probeNonNativeAudio(context(fixture("mka-opus.mka")))).toBe(0);
    expect(await probeNonNativeAudio(context(fixture("wave-alaw.wav")))).toBe(0);
  });
});
