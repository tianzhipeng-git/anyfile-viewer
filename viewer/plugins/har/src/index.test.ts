import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { createDeferredFile, createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { harViewer } from "./index";
import { harManifest } from "./manifest";
import { MAX_HAR_BYTES } from "./parse";

const contexts: ViewerTestContext[] = [];

function fixture(entries = 1) {
  return JSON.stringify({
    log: {
      version: "1.2",
      creator: { name: "Browser DevTools", version: "1" },
      pages: [{ id: "page_1", title: "Example", startedDateTime: "2026-01-01T00:00:00Z", pageTimings: {} }],
      entries: Array.from({ length: entries }, (_, index) => ({
        startedDateTime: "2026-01-01T00:00:00Z",
        time: 125 + index,
        serverIPAddress: "203.0.113.1",
        request: {
          method: index === 0 ? "GET" : "POST",
          url: `https://example.com/api/${index}?q=test`,
          httpVersion: "HTTP/2",
          headers: [{ name: "Accept", value: "application/json" }],
          queryString: [{ name: "q", value: "test" }],
          postData: index === 0 ? undefined : { mimeType: "application/json", text: "{\"ok\":true}" },
        },
        response: {
          status: index === 0 ? 200 : 404,
          statusText: index === 0 ? "OK" : "Not Found",
          httpVersion: "HTTP/2",
          headers: [{ name: "Content-Type", value: "application/json" }],
          bodySize: 1024,
          content: { size: 2048, mimeType: "application/json", text: "{\"value\":1}" },
        },
        timings: { blocked: 1, wait: 100, receive: 24 },
      })),
    },
  });
}

function contextFor(contents: string, locale = "zh-CN") {
  const test = createViewerTestContext(new File([contents], "network.har", { type: "application/json" }));
  contexts.push(test);
  return { ...test, context: { ...test.context, locale } };
}

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
});

describe("HAR viewer", () => {
  it("publishes a valid HAR manifest", () => {
    expect(() => validateManifest(harManifest)).not.toThrow();
    expect(harManifest.formats[0].extensions).toEqual([".har"]);
  });

  it("renders request summaries and selected request details", async () => {
    const test = contextFor(fixture(2));
    const directRead = vi.spyOn(test.context.file, "arrayBuffer");
    const controller = await harViewer.open(test.context);

    expect(test.container.textContent).toContain("2 请求");
    expect(test.container.textContent).toContain("GET");
    expect(test.container.textContent).toContain("https://example.com/api/0?q=test");
    expect(test.container.textContent).toContain("Content-Type");
    expect(test.container.textContent).toContain("203.0.113.1");
    expect(test.container.querySelectorAll(".anyfile-har-viewer__row")).toHaveLength(2);
    expect(directRead).not.toHaveBeenCalled();
    expect(test.progress.at(-1)?.stage).toBe("ready");

    test.container.querySelectorAll<HTMLElement>(".anyfile-har-viewer__row")[1].click();
    expect(test.container.textContent).toContain("Not Found");
    expect(test.container.textContent).toContain("{\"ok\":true}");
    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("filters requests and paginates large captures", async () => {
    const test = contextFor(fixture(105));
    const controller = await harViewer.open(test.context);
    expect(test.container.querySelectorAll(".anyfile-har-viewer__row")).toHaveLength(100);
    expect(test.container.textContent).toContain("1–100 / 105");

    const filter = test.container.querySelector<HTMLInputElement>("[data-har-filter]")!;
    filter.value = "/104";
    filter.dispatchEvent(new Event("input"));
    expect(test.container.querySelectorAll(".anyfile-har-viewer__row")).toHaveLength(1);
    expect(test.container.textContent).toContain("/104?q=test");
    await controller.dispose();
  });

  it("rejects invalid and oversized HAR files", async () => {
    await expect(harViewer.open(contextFor("{\"log\":{}}").context)).rejects.toMatchObject({ code: "invalid-file" });
    const oversized = { name: "large.har", size: MAX_HAR_BYTES + 1 } as File;
    const test = createViewerTestContext(oversized);
    contexts.push(test);
    await expect(harViewer.open(test.context)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("cancels a pending read during opening", async () => {
    const deferred = createDeferredFile("pending.har", 1024);
    const test = createViewerTestContext(deferred.file);
    contexts.push(test);
    const opening = harViewer.open(test.context);
    test.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(test.container.childElementCount).toBe(0);
  });
});
