import { describe, expect, it } from "vitest";

import { probeData } from "./probe";

describe("data viewer probe", () => {
  it.each(["sample.duckdb", "sample.DDB"])("reports DuckDB %s at level 3", async (name) => {
    await expect(probeData({
      file: new File([], name),
      signal: new AbortController().signal,
    })).resolves.toBe(3);
  });

  it("leaves the existing data formats at their current inspection level", async () => {
    await expect(probeData({
      file: new File([], "records.parquet"),
      signal: new AbortController().signal,
    })).resolves.toBe(1);
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeData({ file: new File([], "sample.duckdb"), signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
