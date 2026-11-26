// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { describe, expect, it } from "vitest";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");

describe("stat-data ./extract (ReadStat WASM in Node)", () => {
  it("passes extractor compliance on SPSS, Stata and SAS samples", async () => {
    await assertExtractorCompliance(extractor, [
      { name: "iris.sav", filePath: resolve(EXAMPLES, "iris.sav"), targetId: "data", filter: "setosa", smallMaxBytes: 400, invalidBytes: new TextEncoder().encode("not a stat file") },
      { name: "sample.por", filePath: resolve(EXAMPLES, "sample.por"), targetId: "variables" },
      { name: "stata14_118.dta", filePath: resolve(EXAMPLES, "stata14_118.dta") },
      { name: "airline.sas7bdat", filePath: resolve(EXAMPLES, "airline.sas7bdat") },
    ]);
  });

  it("reads labelled rows through BinarySource and pages filtered data by source row", async () => {
    const bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, "iris.sav")));
    const context = {
      source: createBufferBinarySource(bytes, "iris.sav"),
      file: new File([bytes], "iris.sav"),
      vendor: createNodeVendorAssets(),
      signal: new AbortController().signal,
    };
    const inspected = await extractor.inspect(context);
    expect(inspected.metadata).toMatchObject({ format: "sav", rows: 150, variables: 5 });

    const species: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await extractor.read(context, { target: "data", filter: "virginica", cursor, maxBytes: 600 });
      species.push(...page.content.split("\n").slice(2).map((line) => line.split(" | ").at(-1)!.replace(/ \|$/, "")));
      cursor = page.nextCursor;
    } while (cursor);
    expect(species).toHaveLength(50);
    expect(new Set(species)).toEqual(new Set(["virginica (3)"]));
  });
});
