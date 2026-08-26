import { describe, expect, it } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";

import { codeManifest } from "./manifest";
import { modeForFileName } from "./modes";

describe("Code viewer", () => {
  it("publishes a valid manifest with code and text formats", () => {
    expect(() => validateManifest(codeManifest)).not.toThrow();
    expect(codeManifest.formats[0].extensions).toContain(".txt");
    expect(codeManifest.formats[0].extensions).toContain(".json");
    expect(codeManifest.formats[0].extensions).toContain(".xml");
    expect(codeManifest.formats[0].fileNames).toContain("Dockerfile");
  });

  it("selects Ace modes from extensions and well-known file names", () => {
    expect(modeForFileName("src/App.tsx")).toBe("tsx");
    expect(modeForFileName("config.json")).toBe("json");
    expect(modeForFileName("Dockerfile")).toBe("dockerfile");
    expect(modeForFileName("README.txt")).toBe("plain_text");
    expect(modeForFileName("unknown.data")).toBe("plain_text");
  });
});
