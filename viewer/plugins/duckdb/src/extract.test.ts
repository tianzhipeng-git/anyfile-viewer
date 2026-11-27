// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { DEFAULT_READ_MAX_BYTES } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");

function contextFor(name: string) {
  const filePath = resolve(EXAMPLES, name);
  const bytes = new Uint8Array(readFileSync(filePath));
  return {
    source: createBufferBinarySource(bytes, name, filePath),
    file: new File([bytes], name),
    vendor: createNodeVendorAssets(),
    signal: new AbortController().signal,
  };
}

const query = (name: string, sql: string) => extractor.query!(contextFor(name), { sql, maxBytes: DEFAULT_READ_MAX_BYTES });

describe("duckdb ./extract", () => {
  it("passes extractor compliance on real DuckDB, CSV and Arrow samples", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "analytics.ddb",
        filePath: resolve(EXAMPLES, "analytics.ddb"),
        invalidBytes: new TextEncoder().encode("not a duckdb database file"),
        sampleQuery: "SELECT name, department FROM people ORDER BY id",
        writeQuery: "INSERT INTO people VALUES (9, 'x', 'y', true)",
        targetId: "table:people",
        unsupportedFilterTargetId: "schema",
        filter: "research",
        smallMaxBytes: 120,
      },
      {
        name: "people.csv",
        filePath: resolve(EXAMPLES, "people.csv"),
        sampleQuery: "SELECT * FROM data WHERE active",
        filter: "ada",
        smallMaxBytes: 120,
      },
      {
        name: "events.arrow",
        filePath: resolve(EXAMPLES, "events.arrow"),
        invalidBytes: new TextEncoder().encode("not an arrow ipc stream"),
        sampleQuery: "SELECT event_type, count(*) AS n FROM data GROUP BY ALL ORDER BY 1",
        smallMaxBytes: 120,
      },
    ]);
  }, 60_000);

  it("lists database tables and renders values as DuckDB text", async () => {
    const inspected = await extractor.inspect(contextFor("analytics.ddb"));
    expect(inspected.targets.map(({ id }) => id)).toEqual(["schema", "table:metrics", "table:people"]);
    expect(inspected.targets.find(({ id }) => id === "table:people")?.size).toBe(3);

    const people = await extractor.read(contextFor("people.csv"), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(people.content).toContain("| 1 | Ada Lovelace | Research | true | 1843-01-01 |");

    const grouped = await query("analytics.ddb", "SELECT department, count(*) AS n FROM people GROUP BY ALL ORDER BY 1");
    expect(grouped.content).toContain("| Engineering | 1 |");
    expect((await query("people.csv", "DESCRIBE data")).content).toContain("BIGINT");
  });

  it("keeps the engine sandboxed and read-only", async () => {
    for (const sql of [
      "SELECT * FROM read_csv('/etc/hostname')",
      "SELECT * FROM glob('*')",
      "SELECT 1 /* ; */ ; COPY people TO 'out.csv'",
      "SELECT $$x$$; SET enable_external_access = true",
      "FROM people; DETACH source",
      "INSTALL httpfs",
    ]) {
      await expect(query("analytics.ddb", sql), sql).rejects.toMatchObject({ code: "unsupported-capability" });
    }
    await expect(query("analytics.ddb", "SELEC 1")).rejects.toMatchObject({ code: "unsupported-capability" });
    await expect(query("analytics.ddb", "SELECT * FROM missing_table")).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("reports formats that need an extension DuckDB cannot fetch offline", async () => {
    await expect(extractor.inspect(contextFor("people.parquet"))).rejects.toMatchObject({ code: "runtime-unavailable" });
  });
});
