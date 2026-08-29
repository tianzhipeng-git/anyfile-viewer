import { describe, expect, it } from "vitest";

import { nonNativeVideoManifest } from "./manifest";

describe("non-native video manifest", () => {
  it("declares only the first Matroska delivery", () => {
    expect(nonNativeVideoManifest).toMatchObject({
      protocolVersion: 1,
      id: "non-native-video",
      workspaceAccess: "none",
    });
    expect(nonNativeVideoManifest.formats.flatMap(({ extensions }) => extensions))
      .toEqual([".mkv", ".mk3d"]);
  });
});
