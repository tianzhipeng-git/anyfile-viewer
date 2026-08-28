import { describe, expect, it } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { cameraRawManifest } from "./manifest";

describe("camera RAW manifest", () => {
  it("declares the container-validated RAW extensions", () => {
    expect(() => validateManifest(cameraRawManifest)).not.toThrow();
    expect(cameraRawManifest.formats[0].extensions).toEqual([".dng", ".cr2", ".cr3", ".crw", ".nef", ".arw", ".raf", ".rwl", ".raw", ".rw2"]);
  });
});
