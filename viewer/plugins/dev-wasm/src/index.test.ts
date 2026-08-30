import { afterEach, describe, expect, it, vi } from "vitest";
import { createTrackedFile, createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { validateManifest } from "@anyfile/viewer-protocol";

import { devWasmViewer } from "./index";
import { devWasmManifest } from "./manifest";
import { wasmFixture } from "./test-fixtures";

const contexts: ViewerTestContext[] = [];
afterEach(() => { for (const context of contexts.splice(0)) context.cleanup(); });

function testContext(bytes: Uint8Array) {
  const context = createViewerTestContext(new File([bytes.slice().buffer as ArrayBuffer], "module.wasm"));
  contexts.push(context);
  return context;
}

describe("dev wasm viewer", () => {
  it("publishes a valid manifest", () => expect(() => validateManifest(devWasmManifest)).not.toThrow());

  it("renders module sections, imports, exports, memory, and body sizes with bounded reads", async () => {
    const tracked = createTrackedFile(wasmFixture(), "module.wasm");
    const context = createViewerTestContext(tracked.file);
    contexts.push(context);
    const wholeRead = vi.spyOn(tracked.file, "arrayBuffer");
    const controller = await devWasmViewer.open(context.context);
    expect(context.container.textContent).toContain("WebAssembly 结构预览");
    expect(context.container.textContent).toContain("env");
    expect(context.container.textContent).toContain("memory");
    expect(context.container.textContent).toContain("Start function: 1");
    expect(wholeRead).not.toHaveBeenCalled();
    expect(Math.max(...tracked.reads.map((read) => read.end - read.start))).toBeLessThanOrEqual(64 * 1024);
    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
  });

  it("rejects malformed LEB128, out-of-range sections, abnormal counts, and truncation", async () => {
    const malformed = Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 1, 0x80, 0x80, 0x80, 0x80, 0x80);
    await expect(devWasmViewer.open(testContext(malformed).context)).rejects.toMatchObject({ code: "invalid-file" });
    const overrun = Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 1, 10, 0);
    await expect(devWasmViewer.open(testContext(overrun).context)).rejects.toMatchObject({ code: "invalid-file" });
    const hugeCount = Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 1, 4, 0xa1, 0x8d, 0x06, 0);
    await expect(devWasmViewer.open(testContext(hugeCount).context)).rejects.toMatchObject({ code: "resource-limit" });
    const truncated = wasmFixture().slice(0, -1);
    await expect(devWasmViewer.open(testContext(truncated).context)).rejects.toMatchObject({ code: "invalid-file" });
  });

  it("cleans active content on cancellation", async () => {
    const context = testContext(wasmFixture());
    const controller = await devWasmViewer.open(context.context);
    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    await controller.dispose();
  });
});
