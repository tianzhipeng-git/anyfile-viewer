import { describe, expect, it } from "vitest";

import { probeCad2d } from "./probe";

const validDxf = "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n";

describe("CAD 2D probe", () => {
  it("returns level 3 for ASCII DXF section headers", async () => {
    const signal = new AbortController().signal;
    await expect(probeCad2d({ file: new File([validDxf], "sample.dxf"), signal })).resolves.toBe(3);
  });

  it("rejects empty, binary, and mismatched files", async () => {
    const signal = new AbortController().signal;
    await expect(probeCad2d({ file: new File([], "empty.dxf"), signal })).resolves.toBe(0);
    await expect(probeCad2d({ file: new File(["AutoCAD Binary DXF\r\n\x1a\x00"], "binary.dxf"), signal })).resolves.toBe(0);
    await expect(probeCad2d({ file: new File(["plain text"], "fake.dxf"), signal })).resolves.toBe(0);
  });
});
