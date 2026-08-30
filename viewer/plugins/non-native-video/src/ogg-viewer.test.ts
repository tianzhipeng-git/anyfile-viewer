import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";

function oggFile() {
  return new File([
    readFileSync(join(process.cwd(), "examples", "ogv-theora-video-only.ogg")),
  ], "clip.ogv");
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("Worker", class Worker {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.head.querySelectorAll('script[src*="/vendor/ogv/"]').forEach((script) => script.remove());
});

describe("OGV.js runtime loading", () => {
  it("retries after a failed runtime request and reports a distribution error", async () => {
    const append = vi.spyOn(document.head, "append").mockImplementation((...nodes) => {
      const script = nodes[0] as HTMLScriptElement;
      queueMicrotask(() => script.dispatchEvent(new Event("error")));
    });
    const { openOggVideo } = await import("./ogg-viewer");

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const context = createViewerTestContext(oggFile());
      await expect(openOggVideo(context.context)).rejects.toMatchObject({
        code: "open-failed",
        message: "Ogg 解码运行时加载失败，请重试。",
      });
      context.cleanup();
      expect(append).toHaveBeenCalledTimes(attempt);
      expect(document.head.querySelector('script[src*="/vendor/ogv/"]')).toBeNull();
    }
  });
});
