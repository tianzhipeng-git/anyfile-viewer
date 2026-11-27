// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentError, DEFAULT_READ_MAX_BYTES, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

describe("sqlite ./extract compliance", () => {
  it("passes extractor compliance and read-only SQL protection on real SQLite fixture", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "sample.sqlite",
        filePath: resolve(EXAMPLES, "sample.sqlite"),
        invalidBytes: new TextEncoder().encode("not a sqlite database"),
        sampleQuery: "SELECT id, name, role FROM users ORDER BY id",
        writeQuery: "DELETE FROM users",
        targetId: "table:users",
        unsupportedFilterTargetId: "schema",
        filter: "a",
        smallMaxBytes: 160,
      },
    ]);
  });

  it("preserves duplicate column names, handles SQL comments safely, and enforces read-only PRAGMA allowlist", async () => {
    const filePath = resolve(EXAMPLES, "sample.sqlite");
    const bytes = new Uint8Array(readFileSync(filePath));
    const context = {
      source: createBufferBinarySource(bytes, "sample.sqlite", filePath),
      file: new File([bytes], "sample.sqlite"),
      vendor: NOOP_VENDOR,
      signal: new AbortController().signal,
    };

    const dupCols = await extractor.query!(context, {
      sql: "SELECT 1 AS id, 2 AS id -- comment with ' quote and ; semicolon",
      maxBytes: DEFAULT_READ_MAX_BYTES,
    });
    expect(dupCols.content).toContain("| 1 | 2 |");

    const pragmaInfo = await extractor.query!(context, {
      sql: "PRAGMA table_info(users)",
      maxBytes: DEFAULT_READ_MAX_BYTES,
    });
    expect(pragmaInfo.content).toContain("name");

    for (const blocked of [
      "PRAGMA journal_mode(WAL)",
      "PRAGMA user_version(99)",
      "SELECT 1 -- '\n; DROP TABLE users",
      "WITH x AS (SELECT 1) INSERT INTO users(name) VALUES('bad')",
    ]) {
      await expect(
        extractor.query!(context, { sql: blocked, maxBytes: DEFAULT_READ_MAX_BYTES }),
      ).rejects.toMatchObject({ code: "unsupported-capability" } satisfies Partial<AgentError>);
    }
  });
});
