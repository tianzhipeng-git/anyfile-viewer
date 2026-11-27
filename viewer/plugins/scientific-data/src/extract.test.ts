// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import { describe, expect, it } from "vitest";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");

function contextFor(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, name)));
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([bytes], name),
    vendor: createNodeVendorAssets(),
    signal: new AbortController().signal,
  };
}

describe("scientific-data ./extract", () => {
  it("passes extractor compliance on HDF5, NetCDF and MATLAB samples", async () => {
    await assertExtractorCompliance(extractor, [
      { name: "climate.h5", filePath: resolve(EXAMPLES, "climate.h5"), targetId: "dataset:/sensors/temperature", filter: "15.3", smallMaxBytes: 300, invalidBytes: readFileSync(resolve(EXAMPLES, "disguised-text.h5")) },
      { name: "ocean-v4.nc4", filePath: resolve(EXAMPLES, "ocean-v4.nc4") },
      { name: "ocean-grid.nc", filePath: resolve(EXAMPLES, "ocean-grid.nc"), targetId: "dataset:/temp", filter: "temp" },
      { name: "experiment.mat", filePath: resolve(EXAMPLES, "experiment.mat"), targetId: "group:/meta", smallMaxBytes: 120 },
    ]);
  });

  it("lists the HDF5 tree as targets and pages N-d values by 2D slice rows", async () => {
    const context = contextFor("climate.h5");
    const inspected = await extractor.inspect(context);
    expect(inspected.metadata).toMatchObject({ format: "hdf5", groups: 2, datasets: 3, attributes: { title: "Synthetic Climate Grid" } });
    expect(inspected.targets.map((t) => t.id)).toEqual([
      "summary",
      "group:/grid",
      "dataset:/grid/elevation",
      "dataset:/grid/station_ids",
      "group:/sensors",
      "dataset:/sensors/temperature",
    ]);

    const first = await extractor.read(context, { target: "dataset:/sensors/temperature", maxBytes: 2_000 });
    expect(first.content).toContain("- filters: deflate");
    expect(first.content).toContain("- units (string (S)): degC");
    expect(first.content).toContain("| [0, 0, :] | 15 | 15.30000019 |");

    const rows: string[] = [];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await extractor.read(context, { target: "dataset:/sensors/temperature", cursor, maxBytes: 600 });
      expect(page.content).not.toContain("# Dataset");
      rows.push(...page.content.split("\n").slice(2).map((line) => line.split(" | ")[0]));
      cursor = page.nextCursor;
    }
    expect(rows.at(-1)).toBe("| [1, 7, :]");
  });

  it("reads NetCDF classic dimensions and MATLAB struct groups through the same targets", async () => {
    const nc = contextFor("ocean-grid.nc");
    expect((await extractor.inspect(nc)).metadata).toMatchObject({ dimensions: { time: "3 (unlimited)", lat: 4, lon: 5 } });
    expect((await extractor.read(nc, { target: "dataset:/lat", maxBytes: 4_000 })).content).toContain("| [3] | 30 |");

    const mat = contextFor("experiment.mat");
    expect((await extractor.read(mat, { target: "dataset:/meta/instrument", maxBytes: 4_000 })).content).toContain("| [0, :] | Spectrometer-A |");
    expect((await extractor.read(mat, { target: "dataset:/phasor", maxBytes: 4_000 })).content).toContain("| [0, :] | 1 + 2i | 3 - 4i |");
    await expect(extractor.read(mat, { target: "group:/signal", maxBytes: 4_000 })).rejects.toMatchObject({ code: "target-not-found" });
  });
});
