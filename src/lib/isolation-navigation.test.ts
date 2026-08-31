import { describe, expect, it } from "vitest";

import { crossesIsolationBoundary } from "./isolation-navigation";

describe("crossesIsolationBoundary", () => {
  it.each([
    ["/en", "/en/view", true],
    ["/zh-CN/formats/pdf", "/zh-CN/view?source=pdf", true],
    ["/en/view", "/en", true],
    ["/en/view", "/en/formats/pdf", true],
    ["/en/view", "/zh-CN/view", false],
    ["/en/view", "#preview", false],
    ["/en/view", "?mode=raw", false],
    ["/", "/formats/pdf", false],
  ])("maps %s -> %s to %s", (currentPathname, href, expected) => {
    expect(crossesIsolationBoundary(currentPathname, href)).toBe(expected);
  });
});
