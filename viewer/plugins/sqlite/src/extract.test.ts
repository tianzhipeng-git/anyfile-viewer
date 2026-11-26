// @vitest-environment node
import { resolve } from "node:path";
import { describe, it } from "vitest";
import { assertExtractorCompliance } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");

describe("sqlite ./extract compliance", () => {
  it("passes extractor compliance and read-only SQL protection on real SQLite fixture", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "sample.sqlite",
        filePath: resolve(EXAMPLES, "sample.sqlite"),
        invalidBytes: new TextEncoder().encode("not a sqlite database"),
        sampleQuery: "SELECT id, name, role FROM users ORDER BY id",
        writeQuery: "DELETE FROM users",
        smallMaxBytes: 160,
      },
    ]);
  });
});
