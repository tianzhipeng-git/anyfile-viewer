// @vitest-environment node
import { resolve } from "node:path";
import { describe, it } from "vitest";
import { assertExtractorCompliance } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");

describe("pst ./extract compliance", () => {
  it("passes extractor compliance on real Outlook PST fixture", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "dist-list.pst",
        filePath: resolve(EXAMPLES, "dist-list.pst"),
        invalidBytes: new TextEncoder().encode("not a pst archive"),
        smallMaxBytes: 256,
      },
    ]);
  });
});
