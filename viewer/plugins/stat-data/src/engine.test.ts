// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { importRuntime } from "@anyfile/runtime-assets";
import { truncated } from "@anyfile/viewer-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createStatEngine, EngineError, type ReadStatModule } from "./engine";
import { createValueFormatter } from "./format-value";
import { detectStatFormat } from "./probe";
import type { StatFormat } from "./types";

const runtime = resolve(process.cwd(), "../../../third_party/readstat/1.1.9-anyfile.1");
let readstat: ReadStatModule;
let bytes: Uint8Array = new Uint8Array();
beforeAll(async () => {
  const { default: create } = await importRuntime<{ default(opts: Record<string, unknown>): Promise<ReadStatModule> }>(
    pathToFileURL(resolve(runtime, "readstat.mjs")).href,
  );
  readstat = await create({
    wasmBinary: readFileSync(resolve(runtime, "readstat.wasm")),
    readAt(position: number, target: Uint8Array) { const chunk = bytes.subarray(position, position + target.length); target.set(chunk); return chunk.length; },
  });
});
function load(name: string, input: Uint8Array = new Uint8Array(readFileSync(resolve("examples", name)))) {
  bytes = input;
  const format = detectStatFormat(bytes) as StatFormat;
  return { format, engine: createStatEngine(readstat, format, bytes.length) };
}
function table(name: string, limit = 5) {
  const { format, engine } = load(name);
  const schema = engine.schema();
  const formatter = createValueFormatter(format, schema);
  const rows = engine.rows(0, limit, 0, schema.variables.length).map((row) => row.map((value, index) => formatter.cell(schema.variables[index], value)));
  return { schema, rows };
}

describe("ReadStat runtime on real samples", () => {
  it("reads SPSS variables, value labels, encodings and missing-value rules", () => {
    const iris = table("iris.sav");
    expect(iris.schema.meta.rows).toBe(150);
    expect(iris.schema.variables.map(({ name }) => name)).toEqual(["Sepal.Length", "Sepal.Width", "Petal.Length", "Petal.Width", "Species"]);
    expect(iris.rows[0]).toEqual(["5.1", "3.5", "1.4", "0.2", "setosa (1)"]);
    const umlauts = table("umlauts.sav");
    expect(umlauts.schema.variables[0].label).toBe("This is an ä-umlaut");
    expect(umlauts.rows.map(([cell]) => cell)).toEqual(["the ä umlaut (1)", "the ü umlaut (2)", "the ä umlaut (1)", "the ö umlaut (3)"]);
    expect(table("labelled-num-na.sav").schema.variables[0].missing).toEqual([[9, 9]]);
  });

  it("pages rows and column windows without reading the whole table", () => {
    const { engine } = load("iris.sav");
    expect(engine.rows(148, 10, 4, 5)).toEqual([[3], [3]]);
    expect(engine.rows(150, 10, 0, 5)).toEqual([]);
  });

  it("reads SPSS portable files with an unknown row count", () => {
    const { schema, rows } = table("sample.por");
    expect(schema.meta.rows).toBe(-1);
    expect(schema.variables).toHaveLength(7);
    expect(rows[0][0]).toBe("a");
  });

  it("reads Stata strL text, tagged missing values, dates and legacy releases", () => {
    const stata = table("stata14_118.dta");
    expect(stata.schema.meta.label).toBe("This is a  Ünicode data label");
    expect(stata.rows[0].slice(0, 3)).toEqual(["Cat", "Bogota", "Bogotá"]);
    expect(table("tagged-na-double.dta", 8).rows.map(([cell]) => cell).slice(5)).toEqual(["apple (.a)", ".h", ".zebra (.z)"]);
    const dates = table("stata13_dates.dta");
    expect(dates.rows[0].slice(0, 4)).toEqual(["2006-11-21 00:00:00", "2006-11-21 00:00:00", "2006-11-21", "2006-11-21"]);
    const legacy = table("stata-compat-105.dta");
    expect(legacy.schema.incomplete).toBe(true);
    expect(legacy.rows[0]).toEqual(["1", "-1", "-1025", "-8388609", "-0.1", "0.1", "2000-01-01", "abcdefghij"]);
  });

  it("reads SAS datasets with truncated numbers, special missing values and dates", () => {
    expect(table("airline.sas7bdat").rows[0]).toEqual(["1948", "1.21399998664856", "0.243000000715256", "0.145400002598763", "1.41499996185303", "0.611999988555908"]);
    expect(table("datetime.sas7bdat").rows[0]).toEqual(["1677-09-22", "1677-09-22", "1677-09-21 00:12:44", "1677-09-21 00:12:43.145", "1912-01-01"]);
    const wide = table("many_columns.sas7bdat");
    expect(wide.schema.variables).toHaveLength(392);
    expect(wide.rows[0][6]).toBe("._");
    const xpt = table("paxraw_d_short.xpt");
    expect(xpt.schema.variables.map(({ name }) => name)).toContain("PAXINTEN");
    expect(xpt.rows[0][0]).toBe("31128");
  });

  it("rejects corrupt and truncated inputs with stable error codes", () => {
    expect(() => load("corrupt.sas7bdat").engine.schema()).toThrow(EngineError);
    const sas = new Uint8Array(readFileSync(resolve("examples", "airline.sas7bdat")));
    expect(() => load("x", truncated(sas, 2048)).engine.schema()).toThrow(expect.objectContaining({ code: "invalid-file" }));
    const sav = new Uint8Array(readFileSync(resolve("examples", "iris.sav")));
    const { engine } = load("x", truncated(sav, 3000));
    expect(engine.schema().meta.rows).toBe(150);
    expect(() => engine.rows(140, 10, 0, 5)).toThrow(expect.objectContaining({ code: "invalid-file" }));
  });
});
