import { afterEach, describe, expect, it, vi } from "vitest";
import { probeModernRaster } from "./probe";
import { inspectModernHeader } from "./probe-format";

const signal = new AbortController().signal;
const file = (bytes: number[], name: string) => new File([new Uint8Array(bytes)], name);

afterEach(() => vi.unstubAllGlobals());

describe("modern raster probe", () => {
  it("recognizes JPEG XL codestream and container signatures", async () => {
    expect(inspectModernHeader(new Uint8Array([0xff, 0x0a]))).toBe("JXL");
    expect(await probeModernRaster({ file: file([0xff, 0x0a], "image.jxl"), signal })).toBe(4);
    expect(inspectModernHeader(new Uint8Array([0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10]))).toBe("JXL");
  });

  it("only offers HEIC when native decoding is available", async () => {
    const close = vi.fn();
    class Decoder {
      static isTypeSupported = vi.fn(async (type: string) => type === "image/heic");
      tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: 1, repetitionCount: 0 } };
      decode = vi.fn(async () => ({ image: { close } }));
      close = vi.fn();
    }
    vi.stubGlobal("ImageDecoder", Decoder);
    const heic = file([0, 0, 0, 20, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0, 104, 101, 105, 99], "image.heic");
    expect(await probeModernRaster({ file: heic, signal })).toBe(3);
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects AVIF and malformed files", async () => {
    expect(await probeModernRaster({ file: file([1, 2, 3], "fake.jxl"), signal })).toBe(0);
    const avif = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0]);
    expect(inspectModernHeader(avif)).toBeUndefined();
  });
});
