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

it("preserves Z and block elevation in three-dimensional lines", () => {
  const scene = parseCadScene("0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n1000000000\n20\n0\n30\n2\n11\n1000000000.01\n21\n0\n31\n5\n0\nENDSEC\n0\nEOF\n");
  const primitive = scene!.primitives[0];
  expect(primitive.kind).toBe("line");
  if (primitive.kind === "line") { expect(primitive.points[0].z).toBe(2); expect(primitive.points[1].z).toBe(5); }
});

it("inherits layer 0 and BYBLOCK colors while applying block elevation", () => {
  const groups = [
    0,"SECTION",2,"BLOCKS",0,"BLOCK",2,"B",70,0,10,0,20,0,30,1,
    0,"LINE",8,"0",62,0,10,0,20,0,30,1,11,1,21,0,31,2,
    0,"ENDBLK",0,"ENDSEC",0,"SECTION",2,"ENTITIES",
    0,"INSERT",2,"B",8,"Parent",62,1,10,3,20,4,30,5,43,2,
    0,"ENDSEC",0,"EOF",
  ];
  const scene = parseCadScene(groups.join("\n") + "\n");
  const line = scene!.primitives[0];
  expect(line.layer).toBe("Parent"); expect(line.color).toBe("#ff0000");
  if (line.kind === "line") expect(line.points.map(point => point.z)).toEqual([5,7]);
});
