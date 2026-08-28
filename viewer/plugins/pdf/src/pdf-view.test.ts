// @vitest-environment node

import { describe, expect, it } from "vitest";

import { calculateFitScale } from "./pdf-view";

describe("PDF page layout", () => {
  it("fits a page inside both horizontal gutters on a wide viewport", () => {
    const scale = calculateFitScale(1_600, 600, 24, 24);

    expect((600 * scale) + 24 + 24).toBeCloseTo(1_600);
  });
});
