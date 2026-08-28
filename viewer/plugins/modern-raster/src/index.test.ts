import { describe, expect, it, vi } from "vitest";
import { modernRasterViewer } from "./index";
import { MAX_MODERN_RASTER_SOURCE_BYTES } from "./limits";

describe("modern raster open", () => {
  it("rejects oversized files before reading or starting a native decoder", async () => {
    const file = { size: MAX_MODERN_RASTER_SOURCE_BYTES + 1 } as File;
    const reportProgress = vi.fn();
    const open = modernRasterViewer.open({
      file,
      container: document.createElement("div"),
      signal: new AbortController().signal,
      locale: "zh-CN",
      reportProgress,
    });
    await expect(open).rejects.toMatchObject({ code: "resource-limit" });
    expect(reportProgress).not.toHaveBeenCalled();
  });
});
