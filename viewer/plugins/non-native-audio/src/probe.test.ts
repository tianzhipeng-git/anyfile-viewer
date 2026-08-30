import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeNonNativeAudio } from "./probe";

function fixture(name: string) { return new File([new Uint8Array(readFileSync(join(process.cwd(), "examples", name)))], name); }
function context(file: File) { return { file, signal: new AbortController().signal }; }

beforeEach(() => { vi.stubGlobal("AudioContext", class AudioContext {}); vi.stubGlobal("AudioDecoder", class AudioDecoder {}); });
afterEach(() => vi.unstubAllGlobals());

describe("non-native audio probe", () => {
  it.each(["mka-opus.mka", "mka-vorbis.mka", "mka-flac.mka", "mka-aac.mka"])("accepts fixed audio-only fixture %s", async (name) => {
    expect(await probeNonNativeAudio(context(fixture(name)))).toBe(3);
  });
  it.each(["mka-video-counterexample.mka", "corrupt.mka", "truncated.mka"])("rejects video or invalid fixture %s", async (name) => {
    expect(await probeNonNativeAudio(context(fixture(name)))).toBe(0);
  });
  it("does not load without required browser capabilities", async () => {
    vi.stubGlobal("AudioDecoder", undefined);
    expect(await probeNonNativeAudio(context(fixture("mka-opus.mka")))).toBe(0);
  });
});
