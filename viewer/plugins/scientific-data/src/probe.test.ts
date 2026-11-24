import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertReadsWithin, createTrackedFile } from "@anyfile/viewer-test";
import { detectScientificFormat, PROBE_READ_BYTES, probeScientificData } from "./probe";

function readExample(name: string): Uint8Array {
  const buf = readFileSync(resolve("examples", name));
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return copy;
}

describe("scientific-data probe", () => {
  it.each([
    ["climate.h5", 4],
    ["ocean-v4.nc4", 4],
    ["ocean-grid.nc", 4],
    ["experiment.mat", 4],
  ] as const)("detects real sample %s at level %d with bounded reads", async (name, level) => {
    const tracked = createTrackedFile(readExample(name), name);
    const result = await probeScientificData({
      file: tracked.file,
      signal: new AbortController().signal,
    });
    expect(result).toBe(level);
    assertReadsWithin(tracked.reads, [{ start: 0, end: PROBE_READ_BYTES }]);
  });

  it("detects MATLAB v7.3 HDF5 file with 512-byte user block", () => {
    const bytes = new Uint8Array(600);
    const header = "MATLAB 7.3 MAT-file, Platform: GLNXA64";
    for (let i = 0; i < header.length; i += 1) bytes[i] = header.charCodeAt(i);
    bytes.set([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a], 512);
    const detected = detectScientificFormat(bytes, ".mat", bytes.length);
    expect(detected?.format).toBe("matlab-v73");
    expect(detected?.level).toBe(4);
  });

  it("detects NetCDF 64-bit Offset (CDF-2) and CDF-5 headers", () => {
    expect(detectScientificFormat(new Uint8Array([0x43, 0x44, 0x46, 0x02, 0, 0, 0, 0]), ".nc", 64)?.format).toBe(
      "netcdf-64bit",
    );
    expect(detectScientificFormat(new Uint8Array([0x43, 0x44, 0x46, 0x05, 0, 0, 0, 0]), ".nc", 64)?.format).toBe(
      "netcdf-cdf5",
    );
  });

  it("rejects disguised, truncated, and aborted inputs", async () => {
    const disguised = createTrackedFile(readExample("disguised-text.h5"), "disguised-text.h5");
    expect(await probeScientificData({ file: disguised.file, signal: new AbortController().signal })).toBe(0);

    const tiny = createTrackedFile(new Uint8Array([0x89, 0x48, 0x44]), "tiny.h5");
    expect(await probeScientificData({ file: tiny.file, signal: new AbortController().signal })).toBe(0);

    const aborted = new AbortController();
    aborted.abort();
    const h5 = createTrackedFile(readExample("climate.h5"), "climate.h5");
    await expect(probeScientificData({ file: h5.file, signal: aborted.signal })).rejects.toThrow();
  });
});
