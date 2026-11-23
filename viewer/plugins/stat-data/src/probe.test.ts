import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { assertReadsWithin, createTrackedFile } from "@anyfile/viewer-test";
import { describe, expect, it } from "vitest";
import { detectStatFormat, HEADER_BYTES, probeStatData } from "./probe";

const example = (name: string) => new Uint8Array(readFileSync(resolve("examples", name)));
const signal = new AbortController().signal;

describe("statistical data probe", () => {
  it("identifies every real sample from a bounded header read", async () => {
    const expected: Record<string, string> = { sav: "sav", por: "por", dta: "dta", sas7bdat: "sas7bdat", xpt: "xpt" };
    for (const name of readdirSync("examples").filter((file) => !file.endsWith(".md"))) {
      const { file, reads } = createTrackedFile(example(name), name);
      const level = await probeStatData({ file, signal });
      assertReadsWithin(reads, [{ start: 0, end: HEADER_BYTES }]);
      if (name.startsWith("corrupt")) continue; // Valid signature; ReadStat rejects it on open.
      expect(detectStatFormat(example(name)), name).toBe(expected[name.split(".").pop()!]);
      expect(level, name).toBe(name.endsWith(".por") ? 3 : 4);
    }
  });

  it("rejects disguised files and honours cancellation", async () => {
    expect(await probeStatData({ file: new File(["SPSS? no, just text"], "disguised.sav"), signal })).toBe(0);
    expect(await probeStatData({ file: new File([new Uint8Array(64)], "zeros.sas7bdat"), signal })).toBe(0);
    expect(await probeStatData({ file: new File([new Uint8Array([0x71, 2, 1, 0])], "tiny.dta"), signal })).toBe(4);
    expect(await probeStatData({ file: new File([new Uint8Array([0x71, 3, 1, 0])], "bad-order.dta"), signal })).toBe(0);
    const abort = new AbortController(); abort.abort();
    await expect(probeStatData({ file: new File(["$FL2"], "x.sav"), signal: abort.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
