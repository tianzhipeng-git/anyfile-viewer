// @vitest-environment node
import { resolve } from "node:path";
import { describe, it } from "vitest";
import { assertExtractorCompliance } from "@anyfile/viewer-test";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");

describe("plist ./extract compliance", () => {
  it("passes extractor compliance on binary and XML plist fixtures", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "app-config.binary.plist",
        filePath: resolve(EXAMPLES, "app-config.binary.plist"),
        invalidBytes: new TextEncoder().encode("not a plist"),
        filter: "a",
        smallMaxBytes: 120,
      },
      {
        name: "app-config.xml.plist",
        filePath: resolve(EXAMPLES, "app-config.xml.plist"),
        smallMaxBytes: 160,
      },
    ]);
  });
});
