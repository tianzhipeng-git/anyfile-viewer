import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PUBLISHED_LOCALES } from "../i18n/config";
import { ANIMATION_SAMPLE_EXTENSIONS, getFormatSample } from "./format-samples";

describe("format sample entry", () => {
  it("offers existing sample files and attribution in each published language", () => {
    for (const locale of PUBLISHED_LOCALES) {
      for (const extension of [...ANIMATION_SAMPLE_EXTENSIONS, "skp", "psb"]) {
        const sample = getFormatSample(extension, locale)!;
        expect(statSync(join(process.cwd(), "public", sample.download)).size).toBeGreaterThan(0);
        expect(statSync(join(process.cwd(), "public", sample.source)).size).toBeGreaterThan(0);
        expect(sample.name).not.toBe("");
        expect(sample.description).not.toBe("");
        expect(sample.credit).toMatch(/MIT|Apache-2.0/);
      }
    }
  });

  it("does not offer a sample for unsupported formats", () => {
    expect(getFormatSample("pdf", "en")).toBeUndefined();
    expect(getFormatSample("../../private", "en")).toBeUndefined();
  });
});
