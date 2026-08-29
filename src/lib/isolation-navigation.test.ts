import { describe, expect, it } from "vitest";

import { crossesIsolationBoundary } from "./isolation-navigation";

describe("crossesIsolationBoundary", () => {
  it.each([
    ["/", "/view", true],
    ["/formats/pdf", "/view?source=pdf", true],
    ["/view", "/", true],
    ["/view", "/formats/pdf", true],
    ["/view", "/view", false],
    ["/view", "#preview", false],
    ["/view", "?mode=raw", false],
    ["/", "/formats/pdf", false],
  ])("maps %s -> %s to %s", (currentPathname, href, expected) => {
    expect(crossesIsolationBoundary(currentPathname, href)).toBe(expected);
  });
});
