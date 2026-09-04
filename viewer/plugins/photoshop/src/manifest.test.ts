import { describe, expect, it } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";

import { photoshopManifest } from "./manifest";

describe("Photoshop manifest", () => {
  it("is protocol compliant and declares PSD and PSB", () => {
    expect(() => validateManifest(photoshopManifest)).not.toThrow();
    expect(photoshopManifest.formats[0].extensions).toEqual([".psd", ".psb"]);
  });
});
