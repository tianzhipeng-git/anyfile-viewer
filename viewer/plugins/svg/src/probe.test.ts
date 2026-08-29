import { describe, expect, it } from "vitest";

import { probeSafeSvg } from "./probe";

describe("safe SVG probe", () => {
  it("returns level 3 for SVG and SVGZ signatures", async () => {
    const signal = new AbortController().signal;
    await expect(probeSafeSvg({ file: new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "sample.svg"), signal })).resolves.toBe(3);
    await expect(probeSafeSvg({ file: new File([new Uint8Array([0x1f, 0x8b, 0x08])], "sample.svgz"), signal })).resolves.toBe(3);
  });

  it("rejects empty and mismatched files", async () => {
    const signal = new AbortController().signal;
    await expect(probeSafeSvg({ file: new File([], "empty.svg"), signal })).resolves.toBe(0);
    await expect(probeSafeSvg({ file: new File(["plain text"], "fake.svg"), signal })).resolves.toBe(0);
  });
});
