import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCadScene } from "./scene";

describe("CAD 2D scene parser", () => {
  it("parses common 2D entities and layers from a real fixture", () => {
    const source = readFileSync(join(process.cwd(), "examples/sample.dxf"), "utf8");
    const scene = parseCadScene(source);

    expect(scene).toBeDefined();
    expect(scene!.entityCount).toBe(4);
    expect(scene!.layerCount).toBe(2);
    expect(scene!.primitives.length).toBeGreaterThan(0);
    expect(scene!.bounds.minX).toBeLessThanOrEqual(0);
    expect(scene!.bounds.maxX).toBeGreaterThanOrEqual(20);
  });

  it("rejects plain text without a valid DXF structure", () => {
    expect(parseCadScene("plain text")).toBeUndefined();
  });

  it("preserves sub-unit drawing extents for viewport fitting", () => {
    const scene = parseCadScene("0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n0.1\n21\n0.05\n0\nENDSEC\n0\nEOF\n");

    expect(scene?.bounds.width).toBeCloseTo(0.1);
    expect(scene?.bounds.height).toBeCloseTo(0.05);
  });
});
