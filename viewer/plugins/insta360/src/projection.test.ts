import { describe, expect, it } from "vitest";

import {
  lensZeroBlendWeight,
  ONE_RS_VIDEO_PROJECTION,
  projectionFromInsvCalibration,
  projectDirectionToLens,
  X3_PHOTO_PROJECTION,
  X3_VIDEO_PROJECTION,
  X4_VIDEO_PROJECTION,
  X5_VIDEO_PROJECTION,
  X6_PROJECTION,
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

describe("model-specific projection profiles", () => {
  it("does not reuse the X3 angle approximation for newer cameras", () => {
    expect(X4_VIDEO_PROJECTION.kind).toBe("calibrated-equidistant");
    expect(ONE_RS_VIDEO_PROJECTION.kind).toBe("mei");
    expect(X5_VIDEO_PROJECTION.kind).toBe("mei");
    expect(X6_PROJECTION.kind).toBe("mei");
    expect(X5_VIDEO_PROJECTION.lenses[0].xi).toBe(2);
    expect(X5_VIDEO_PROJECTION.lenses[1].radial).toEqual([0.19422133, 1.97706831, -2.96845055, 0]);
    expect(X5_VIDEO_PROJECTION.lenses[1].tangential).toEqual([0.00193654, -0.00116275]);
    expect(X6_PROJECTION.lenses[0].xi).toBeCloseTo(2.45543);
    expect(X4_VIDEO_PROJECTION.lenses[0].center).not.toEqual(X4_VIDEO_PROJECTION.lenses[1].center);
  });

  it("builds different per-lens parameters from INSV offset_v3 calibration", () => {
    const profile = projectionFromInsvCalibration([
      2, 2, 4000, 4010, 2500, 2510, 0.1, 0.2, 90, 0, 0, 0, 0.1, 0.2, 0.3, 0.004, 0.005, 10000, 5000, 1,
      2.1, 4020, 4030, 7505, 2490, -0.1, -0.2, 90, 0, 0, 0, 0.11, 0.22, 0.33, 0.006, 0.007, 10000, 5000, 1, 42,
    ], 5000, 5000)!;
    expect(profile.lenses[0].focal).toEqual([0.8, 0.802]);
    expect(profile.lenses[0].center).toEqual([0.5, 0.502]);
    expect(profile.lenses[1].center).toEqual([0.501, 0.498]);
    expect(profile.lenses[1].radial).toEqual([0.11, 0.22, 0.33, 0]);
  });
});
