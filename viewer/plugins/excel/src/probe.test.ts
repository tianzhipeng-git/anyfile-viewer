import { describe, expect, it } from "vitest";

import { excelManifest } from "./manifest";
import { probeExcelWorkbook } from "./probe";

describe("excel viewer probe", () => {
  it.each(excelManifest.formats.flatMap((format) => [...format.extensions]))(
    "reports main-content support for %s, including uppercase names",
    async (extension) => {
      for (const name of [`sample${extension}`, `SAMPLE${extension.toUpperCase()}`]) {
        await expect(probeExcelWorkbook({
          file: new File([], name), signal: new AbortController().signal,
        })).resolves.toBe(3);
      }
    },
  );

  it("rejects an undeclared format", async () => {
    await expect(probeExcelWorkbook({
      file: new File([], "image.png"), signal: new AbortController().signal,
    })).resolves.toBe(0);
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeExcelWorkbook({ file: new File([], "sample.csv"), signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
