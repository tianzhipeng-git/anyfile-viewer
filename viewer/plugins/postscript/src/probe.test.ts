import { describe, expect, it } from "vitest";

import { probePostscript } from "./probe";

const signal = new AbortController().signal;

describe("probePostscript", () => {
  it("recognizes DSC PostScript and EPS headers", async () => {
    await expect(probePostscript({ file: new File(["%!PS-Adobe-3.0 EPSF-3.0\n"], "art.eps"), signal })).resolves.toBe(3);
    await expect(probePostscript({ file: new File(["%!PS-Adobe-3.0 EPSF-3.0\n"], "art.epsi"), signal })).resolves.toBe(3);
    await expect(probePostscript({ file: new File(["%!PS-Adobe-3.0\n"], "pages.ps"), signal })).resolves.toBe(3);
    await expect(probePostscript({ file: new File(["%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator\n"], "legacy.ai"), signal })).resolves.toBe(3);
  });

  it("recognizes the DOS EPS binary header", async () => {
    const bytes = new Uint8Array([0xc5, 0xd0, 0xd3, 0xc6, 30, 0, 0, 0]);
    await expect(probePostscript({ file: new File([bytes], "art.eps"), signal })).resolves.toBe(3);
  });

  it("rejects unrelated content", async () => {
    await expect(probePostscript({ file: new File(["not postscript"], "fake.eps"), signal })).resolves.toBe(0);
  });

  it("supports cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probePostscript({ file: new File(["%!PS-Adobe-3.0"], "pages.ps"), signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
