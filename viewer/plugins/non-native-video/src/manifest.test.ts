import { describe, expect, it } from "vitest";

import { nonNativeVideoManifest } from "./manifest";

describe("non-native video manifest", () => {
  it("declares the verified stage 2 video deliveries", () => {
    expect(nonNativeVideoManifest).toMatchObject({
      protocolVersion: 1,
      id: "non-native-video",
      workspaceAccess: "none",
    });
    expect(nonNativeVideoManifest.formats.flatMap(({ extensions }) => extensions))
      .toEqual([".mkv", ".mk3d", ".ts", ".mts", ".m2ts", ".m2t", ".mov", ".qt", ".ogv", ".ogg"]);
  });
});
