import { describe, expect, it } from "vitest";
import { ViewerError } from "@anyfile/viewer-protocol";

import { resolveViewerErrorMessage } from "./viewer-host";

const FALLBACK = "Could not open file.";
const OFFLINE = "Format is not cached for offline use.";

describe("resolveViewerErrorMessage", () => {
  it("maps uncached chunk and runtime failures to the offline notice when offline", () => {
    expect(resolveViewerErrorMessage(new TypeError("ChunkLoadError"), FALLBACK, OFFLINE, true).message)
      .toBe(OFFLINE);
    expect(resolveViewerErrorMessage(new ViewerError("open-failed", "Failed"), FALLBACK, OFFLINE, true).message)
      .toBe(OFFLINE);
    expect(resolveViewerErrorMessage(new ViewerError("unsupported-environment", "Runtime failed"), FALLBACK, OFFLINE, true).message)
      .toBe(OFFLINE);
    expect(resolveViewerErrorMessage(new ViewerError("runtime-unavailable", "Runtime fetch failed"), FALLBACK, OFFLINE, true).message)
      .toBe(OFFLINE);
  });

  it("preserves file-specific ViewerErrors even when offline", () => {
    expect(resolveViewerErrorMessage(new ViewerError("invalid-file", "Corrupt file"), FALLBACK, OFFLINE, true).message)
      .toBe("Corrupt file");
    expect(resolveViewerErrorMessage(new ViewerError("resource-limit", "File too large"), FALLBACK, OFFLINE, true).message)
      .toBe("File too large");
    expect(resolveViewerErrorMessage(new ViewerError("missing-related-file", "Missing sidecar"), FALLBACK, OFFLINE, true).message)
      .toBe("Missing sidecar");
  });

  it("preserves original error messages when online", () => {
    expect(resolveViewerErrorMessage(new ViewerError("unsupported-environment", "WebGL required"), FALLBACK, OFFLINE, false).message)
      .toBe("WebGL required");
    expect(resolveViewerErrorMessage(new Error("boom"), FALLBACK, OFFLINE, false).message)
      .toBe(FALLBACK);
  });
});
