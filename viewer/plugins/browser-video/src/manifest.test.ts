import { describe, expect, it } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";

import { browserVideoManifest } from "./manifest";

describe("browser video manifest", () => {
  it("publishes only the stage 1 container extensions", () => {
    expect(() => validateManifest(browserVideoManifest)).not.toThrow();
    expect(browserVideoManifest.formats.flatMap(({ extensions }) => extensions)).toEqual([
      ".mp4", ".m4v", ".mov", ".qt", ".3gp", ".3g2", ".webm",
    ]);
  });
});
