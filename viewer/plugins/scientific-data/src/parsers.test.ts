import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import h5wasm from "h5wasm/node";
import { zlibSync } from "fflate";
import { ViewerError } from "@anyfile/viewer-protocol";
import { Hdf5Engine } from "./hdf5-engine";
import { openMatlabV4Source, openMatlabV5Source } from "./matlab-mat";
import { unzlibBounded } from "./matlab-parse";
import { openNetCdfClassicSource } from "./netcdf-classic";

const EXAMPLES = resolve("examples");

function blobFromExample(name: string): Blob {
  const buf = readFileSync(resolve(EXAMPLES, name));
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Blob([copy]);
}

describe("HDF5 engine (h5wasm/node)", () => {
  it("inspects groups, attributes, 3D slices, transposed axes, and 2D heatmaps on climate.h5", async () => {
    await h5wasm.ready;
    const h5Path = resolve(EXAMPLES, "climate.h5");
    const size = readFileSync(h5Path).byteLength;
    const file = new h5wasm.File(h5Path, "r");
    const engine = new Hdf5Engine(file, "hdf5", size);
    try {
      const summary = engine.summary();
      expect(summary.format).toBe("hdf5");
      expect(summary.rootChildren.map((c) => c.name).sort()).toEqual(["grid", "sensors"]);
      expect(summary.rootAttributes.find((a) => a.name === "title")?.preview).toBe("Synthetic Climate Grid");

      const sensors = engine.listGroup("/sensors");
      expect(sensors.children.map((c) => c.name)).toEqual(["temperature"]);
      expect(sensors.attributes.find((a) => a.name === "location")?.preview).toBe("Pacific Station");

      const tempInfo = engine.inspectDataset("/sensors/temperature");
      expect(tempInfo.shape).toEqual([2, 8, 10]);
      expect(tempInfo.dtype).toBe("float32");
      expect(tempInfo.isNumeric).toBe(true);
      expect(tempInfo.attributes.find((a) => a.name === "units")?.preview).toBe("degC");

      const slice = engine.readSlice({
        path: "/sensors/temperature",
        fixedIndices: [1, 0, 0],
        rowAxis: 1,
        colAxis: 2,
        rowOffset: 0,
        rowCount: 2,
        colOffset: 0,
        colCount: 3,
      });
      expect(slice.rows).toBe(2);
      expect(slice.cols).toBe(3);
      expect(Number(slice.values[0])).toBeCloseTo(17.0, 2);
      expect(Number(slice.values[1])).toBeCloseTo(17.3, 2);

      // Transposed axes (rowAxis > colAxis)
      const transposed = engine.readSlice({
        path: "/sensors/temperature",
        fixedIndices: [1, 0, 0],
        rowAxis: 2,
        colAxis: 1,
        rowOffset: 0,
        rowCount: 3,
        colOffset: 0,
        colCount: 2,
      });
      expect(Number(transposed.values[2])).toBeCloseTo(17.3, 2);

      const heatmap = engine.readHeatmap({
        path: "/grid/elevation",
        fixedIndices: [0, 0],
        rowAxis: 0,
        colAxis: 1,
        maxDim: 64,
      });
      expect(heatmap.width).toBe(16);
      expect(heatmap.height).toBe(12);
      expect(heatmap.finiteCount).toBe(192);
      expect(heatmap.max).toBeCloseTo(100, 1);
    } finally {
      engine.close();
    }
  });

  it("reads NetCDF-4 HDF5 sample ocean-v4.nc4", async () => {
    await h5wasm.ready;
    const nc4Path = resolve(EXAMPLES, "ocean-v4.nc4");
    const file = new h5wasm.File(nc4Path, "r");
    const engine = new Hdf5Engine(file, "netcdf4", readFileSync(nc4Path).byteLength);
    try {
      const summary = engine.summary();
      expect(summary.formatDetail).toBe("NetCDF-4 (HDF5)");
      expect(summary.rootAttributes.find((a) => a.name === "Conventions")?.preview).toBe("CF-1.8");
      const slice = engine.readSlice({
        path: "/sst",
        fixedIndices: [0, 0],
        rowAxis: 0,
        colAxis: 1,
        rowOffset: 0,
        rowCount: 2,
        colOffset: 0,
        colCount: 2,
      });
      expect(Number(slice.values[0])).toBeCloseTo(20.0, 2);
      expect(Number(slice.values[1])).toBeCloseTo(20.25, 2);
    } finally {
      engine.close();
    }
  });
});

describe("NetCDF Classic parser", () => {
  it("parses dimensions, attributes, fixed vars, unlimited record vars, and heatmaps on ocean-grid.nc", async () => {
    const source = await openNetCdfClassicSource(blobFromExample("ocean-grid.nc"), new AbortController().signal);
    expect(source.summary.format).toBe("netcdf-classic");
    expect(source.summary.dimensions).toEqual([
      { name: "time", size: 3, unlimited: true },
      { name: "lat", size: 4, unlimited: false },
      { name: "lon", size: 5, unlimited: false },
    ]);
    expect(source.summary.rootAttributes.find((a) => a.name === "title")?.preview).toBe("Ocean Grid Classic Sample");

    const latSlice = await source.readSlice({
      path: "/lat",
      fixedIndices: [0],
      rowAxis: 0,
      colAxis: 0,
      rowOffset: 0,
      rowCount: 4,
      colOffset: 0,
      colCount: 1,
    });
    expect(latSlice.values).toEqual(["-30", "-10", "10", "30"]);

    // Record variable at time=2, lat=1, lon=2 => 20 + 2 + (1*5 + 2)*0.5 = 25.5
    const tempSlice = await source.readSlice({
      path: "/temp",
      fixedIndices: [2, 0, 0],
      rowAxis: 1,
      colAxis: 2,
      rowOffset: 0,
      rowCount: 2,
      colOffset: 0,
      colCount: 3,
    });
    expect(Number(tempSlice.values[0])).toBeCloseTo(22.0, 3);
    expect(Number(tempSlice.values[5])).toBeCloseTo(25.5, 3);

    const hm = await source.readHeatmap({
      path: "/temp",
      fixedIndices: [0, 0, 0],
      rowAxis: 1,
      colAxis: 2,
      maxDim: 32,
    });
    expect(hm.height).toBe(4);
    expect(hm.width).toBe(5);
    expect(hm.min).toBeCloseTo(20.0, 3);
    expect(hm.max).toBeCloseTo(29.5, 3);
    source.dispose();
  });

  it("rejects truncated NetCDF classic headers with invalid-file", async () => {
    const bad = new Blob([new Uint8Array([0x43, 0x44, 0x46, 0x01, 0, 0, 0, 1, 0, 0, 0, 0x0a])]);
    await expect(openNetCdfClassicSource(bad, new AbortController().signal)).rejects.toMatchObject({
      code: "invalid-file",
    });
  });
});

describe("MATLAB MAT parser", () => {
  it("parses compressed Level 5 numeric, 3D, char, complex, nested struct, and sparse arrays on experiment.mat", async () => {
    const source = await openMatlabV5Source(blobFromExample("experiment.mat"), new AbortController().signal);
    const names = source.summary.rootChildren.map((c) => c.name).sort();
    expect(names).toEqual(["label", "meta", "phasor", "signal", "volume", "weights"]);

    const labelSlice = await source.readSlice({
      path: "/label",
      fixedIndices: [0, 0],
      rowAxis: 0,
      colAxis: 1,
      rowOffset: 0,
      rowCount: 5,
      colOffset: 0,
      colCount: 5,
    });
    expect(labelSlice.values[0]).toBe("Anyfile MATLAB Sample");

    const phasorSlice = await source.readSlice({
      path: "/phasor",
      fixedIndices: [0, 0],
      rowAxis: 0,
      colAxis: 1,
      rowOffset: 0,
      rowCount: 2,
      colOffset: 0,
      colCount: 2,
    });
    expect(phasorSlice.values).toEqual(["1 + 2i", "3 - 4i", "5", "0 - 1i"]);

    const metaGroup = await source.listGroup("/meta");
    expect(metaGroup.children.map((c) => c.name).sort()).toEqual(["gain", "instrument"]);
    const gainSlice = await source.readSlice({
      path: "/meta/gain",
      fixedIndices: [0, 0],
      rowAxis: 0,
      colAxis: 1,
      rowOffset: 0,
      rowCount: 1,
      colOffset: 0,
      colCount: 1,
    });
    expect(gainSlice.values).toEqual(["2.5"]);

    const sparseSlice = await source.readSlice({
      path: "/weights",
      fixedIndices: [0, 0],
      rowAxis: 0,
      colAxis: 1,
      rowOffset: 0,
      rowCount: 2,
      colOffset: 0,
      colCount: 3,
    });
    expect(sparseSlice.values).toEqual(["0", "1.5", "0", "2.25", "0", "-3"]);

    const hm = await source.readHeatmap({
      path: "/signal",
      fixedIndices: [0, 0],
      rowAxis: 0,
      colAxis: 1,
      maxDim: 32,
    });
    expect(hm.height).toBe(4);
    expect(hm.width).toBe(6);
    expect(hm.min).toBeCloseTo(0, 3);
    expect(hm.max).toBeCloseTo(6.28, 2);
    source.dispose();
  });

  it("enforces resource-limit on oversized compressed streams", () => {
    const payload = new Uint8Array(4096);
    const compressed = zlibSync(payload);
    expect(() => unzlibBounded(compressed, 1024)).toThrowError(ViewerError);
    try {
      unzlibBounded(compressed, 1024);
    } catch (error) {
      expect((error as ViewerError).code).toBe("resource-limit");
    }
  });

  it("parses synthetic MATLAB Level 4 matrix", async () => {
    const buf = new ArrayBuffer(20 + 2 + 2 * 2 * 8);
    const view = new DataView(buf);
    view.setInt32(0, 0, true); // IEEE LE, double, numeric
    view.setInt32(4, 2, true); // 2 rows
    view.setInt32(8, 2, true); // 2 cols
    view.setInt32(12, 0, true); // real
    view.setInt32(16, 2, true); // namlen = 2 ("A\0")
    new Uint8Array(buf, 20, 2).set([65, 0]);
    // Column-major: [1, 3, 2, 4] => [[1, 2], [3, 4]]
    view.setFloat64(22, 1, true);
    view.setFloat64(30, 3, true);
    view.setFloat64(38, 2, true);
    view.setFloat64(46, 4, true);
    const source = await openMatlabV4Source(new Blob([buf]), new AbortController().signal);
    const slice = await source.readSlice({
      path: "/A",
      fixedIndices: [0, 0],
      rowAxis: 0,
      colAxis: 1,
      rowOffset: 0,
      rowCount: 2,
      colOffset: 0,
      colCount: 2,
    });
    expect(slice.values).toEqual(["1", "2", "3", "4"]);
    source.dispose();
  });
});

const externalFile = process.env.SCIENTIFIC_TEST_FILE;
describe.skipIf(!externalFile)("external real-world scientific sample", () => {
  it("opens and inspects external file cleanly", async () => {
    const path = externalFile!;
    const raw = readFileSync(path);
    const blob = new Blob([new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)]);
    if (path.endsWith(".nc")) {
      const src = await openNetCdfClassicSource(blob, new AbortController().signal);
      expect(src.summary.rootChildren.length).toBeGreaterThan(0);
      src.dispose();
    } else if (path.endsWith(".mat")) {
      const src = await openMatlabV5Source(blob, new AbortController().signal);
      expect(src.summary.rootChildren.length).toBeGreaterThan(0);
      src.dispose();
    } else {
      await h5wasm.ready;
      const f = new h5wasm.File(path, "r");
      const eng = new Hdf5Engine(f, path.endsWith(".nc4") ? "netcdf4" : "hdf5", raw.byteLength);
      expect(eng.summary().fileSize).toBe(raw.byteLength);
      eng.close();
    }
  });
});
