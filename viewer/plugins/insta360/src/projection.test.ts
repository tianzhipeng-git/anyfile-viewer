import { describe, expect, it } from "vitest";

import { lensZeroBlendWeight, projectDirectionToLens } from "./projection";

describe("X3 equidistant fisheye projection", () => {
  it("maps each optical axis to the center of its lens with the expected handedness", () => {
    expect(projectDirectionToLens([0, 0, -1], 0)).toMatchObject({ u: 0.5, v: 0.5, angle: 0 });
    expect(projectDirectionToLens([0, 0, 1], 1)).toMatchObject({ u: 0.5, v: 0.5, angle: 0 });
    expect(projectDirectionToLens([1, 0, 0], 0)?.u).toBeGreaterThan(0.5);
    expect(projectDirectionToLens([1, 0, 0], 1)?.u).toBeLessThan(0.5);
    expect(projectDirectionToLens([0, 1, 0], 0)?.v).toBeLessThan(0.5);
  });

  it("selects the facing lens and blends evenly at the seam", () => {
    expect(lensZeroBlendWeight([0, 0, -1])).toBe(1);
    expect(lensZeroBlendWeight([0, 0, 1])).toBe(0);
    expect(lensZeroBlendWeight([1, 0, 0])).toBeCloseTo(0.5);
  });
});
