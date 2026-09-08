import { expect, it } from "vitest";
import { PointSampler } from "./sampler";
it("keeps a bounded representative sample and rebases before float conversion", () => {
  const sampler = new PointSampler(100);
  for (let i = 0; i < 10000; i++) sampler.add(1e9 + i / 1000, 0, 0);
  const result = sampler.snapshot(); expect(result.count).toBe(10000); expect(result.positions.length).toBe(300);
  expect(Math.max(...result.positions)).toBeLessThan(10); expect(result.origin[0]).toBeGreaterThanOrEqual(1e9);
});
it("rejects nonfinite points", () => expect(() => new PointSampler().add(NaN, 0, 0)).toThrow());
