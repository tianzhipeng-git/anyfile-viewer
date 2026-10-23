import { describe, expect, it } from "vitest";
import { workspaceEntry } from "./workspace-entry";

describe("workspace entry context", () => {
  it.each([
    ["/en/formats/psb", ".PSB", false],
    ["/zh-CN/formats/apng", ".APNG", false],
    ["/en/formats/insv", ".INSV", true],
    ["/zh-CN/formats/tar.gz", ".TAR.GZ", false],
    ["/en/viewers/insta360", "Insta360", true],
    ["/zh-CN/viewers/gopro-max", "GoPro MAX", false],
    ["/en/viewers/dji-osmo-360", "DJI Osmo 360", false],
  ])("retains the task for %s", (entry, label, pairedInsv) => {
    expect(workspaceEntry(entry)).toEqual({ label, pairedInsv });
  });

  it.each([null, "/en", "/en/view", "/en/categories/engineering", "/en/formats/private-filename", "/en/viewers/unknown", "/en/formats/pdf/secret", "https://example.org/en/formats/pdf", "/fr/formats/pdf"])("uses the general welcome for %s", (entry) => {
    expect(workspaceEntry(entry)).toBeUndefined();
  });
});
