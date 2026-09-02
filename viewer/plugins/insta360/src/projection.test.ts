import { describe, expect, it } from "vitest";

import {
  lensZeroBlendWeight,
  projectDirectionToLens,
  X3_PHOTO_PROJECTION,
  X3_VIDEO_PROJECTION,
} from "./projection";

describe("X3 equidistant fisheye projection", () => {
  it("maps each optical axis to the center of its lens with the expected handedness", () => {
    expect(projectDirectionToLens([0, 0, -1], 0, X3_PHOTO_PROJECTION)).toMatchObject({ u: 0.5, v: 0.5, angle: 0 });
    expect(projectDirectionToLens([0, 0, 1], 1, X3_PHOTO_PROJECTION)).toMatchObject({ u: 0.5, v: 0.5, angle: 0 });
    expect(projectDirectionToLens([1, 0, 0], 0, X3_PHOTO_PROJECTION)?.u).toBeGreaterThan(0.5);
    expect(projectDirectionToLens([1, 0, 0], 1, X3_PHOTO_PROJECTION)?.u).toBeLessThan(0.5);
    expect(projectDirectionToLens([0, 1, 0], 0, X3_PHOTO_PROJECTION)?.v).toBeLessThan(0.5);
  });

  it("selects the facing lens and blends evenly at the seam", () => {
    expect(lensZeroBlendWeight([0, 0, -1], X3_PHOTO_PROJECTION)).toBe(1);
    expect(lensZeroBlendWeight([0, 0, 1], X3_PHOTO_PROJECTION)).toBe(0);
    expect(lensZeroBlendWeight([1, 0, 0], X3_PHOTO_PROJECTION)).toBeCloseTo(0.5);
  });

  it("uses the calibrated photo and video radii at the lens seam", () => {
    expect(projectDirectionToLens([1, 0, 0], 0, X3_PHOTO_PROJECTION)?.u).toBeCloseTo(0.9568528);
    expect(projectDirectionToLens([1, 0, 0], 0, X3_VIDEO_PROJECTION)?.u).toBeCloseTo(0.9699739);
  });
});
