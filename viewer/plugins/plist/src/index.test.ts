import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest, type Locale } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { plistViewer } from "./index";
import { plistManifest } from "./manifest";
import { MAX_PLIST_BYTES, probePlist, readPlist } from "./parse";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../examples");
const binaryBytes = new Uint8Array(readFileSync(join(DIR, "app-config.binary.plist")));
const xmlText = readFileSync(join(DIR, "app-config.xml.plist"), "utf8");

const contexts: ViewerTestContext[] = [];

function contextFor(contents: BlobPart | Uint8Array, name = "config.plist", locale: Locale = "zh-CN") {
  const body = contents instanceof Uint8Array ? Uint8Array.from(contents).buffer : contents;
  const test = createViewerTestContext(new File([body], name, { type: "application/x-plist" }));
  contexts.push(test);
  return { ...test, context: { ...test.context, locale } };
}

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
});

describe("Apple plist viewer", () => {
  it("publishes a valid manifest", () => {
    expect(() => validateManifest(plistManifest)).not.toThrow();
    expect(plistManifest.formats[0].extensions).toEqual([".plist"]);
  });

  it("probes binary and XML plists at a high support level", async () => {
    const signal = new AbortController().signal;
    expect(await probePlist({ file: new File([Uint8Array.from(binaryBytes).buffer], "a.plist"), signal })).toBe(3);
    expect(await probePlist({ file: new File([xmlText], "a.plist"), signal })).toBe(2);
    expect(await probePlist({ file: new File(["not a plist"], "a.plist"), signal })).toBe(0);
    expect(await probePlist({ file: new File([], "empty.plist"), signal })).toBe(0);
  });

  it("rejects a non-plist through open() with a localized error", async () => {
    const zh = contextFor("plain text that is not a property list", "fake.plist", "zh-CN");
    await expect(plistViewer.open(zh.context)).rejects.toMatchObject({
      code: "invalid-file",
      message: expect.stringContaining("属性列表"),
    });
    expect(zh.container.childElementCount).toBe(0);

    const en = contextFor("not a plist", "fake.plist", "en");
    await expect(plistViewer.open(en.context)).rejects.toMatchObject({
      code: "invalid-file",
      message: "The file is damaged or is not a valid property list.",
    });
  });

  it("renders a binary plist into a filterable tree", async () => {
    const test = contextFor(binaryBytes);
    const reportPreview = vi.fn();
    const controller = await plistViewer.open({ ...test.context, reportPreview });

    const text = test.container.textContent ?? "";
    expect(text).toContain("CFBundleIdentifier");
    expect(text).toContain("com.example.demo");
    expect(text).toContain("SupportedLanguages");
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(reportPreview).toHaveBeenCalledExactlyOnceWith({ outcome: "success", kind: "structure" });

    const filter = test.container.querySelector<HTMLInputElement>("[data-plist-filter]")!;
    filter.value = "DemoApp";
    filter.dispatchEvent(new Event("input"));
    expect(test.container.textContent).toContain("DemoApp");
    expect(test.container.textContent).not.toContain("CFBundleIdentifier");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("parses an XML plist and enforces the size limit", async () => {
    const doc = await readPlist(new File([xmlText], "config.plist"), new AbortController().signal);
    expect(doc.kind).toBe("dict");

    const oversized = { name: "big.plist", size: MAX_PLIST_BYTES + 1 } as File;
    await expect(readPlist(oversized, new AbortController().signal)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("disposes an active view when aborted after opening", async () => {
    const test = contextFor(xmlText);
    await plistViewer.open(test.context);
    expect(test.container.childElementCount).toBe(1);
    test.abortController.abort();
    expect(test.container.childElementCount).toBe(0);
  });

  it("cancels a pending read during opening", async () => {
    let release!: (value: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>((resolve) => { release = resolve; });
    const file = { name: "pending.plist", size: 4096, slice() { return { arrayBuffer: () => pending }; } } as unknown as File;
    const test = createViewerTestContext(file);
    contexts.push(test);
    const opening = plistViewer.open(test.context);
    test.abortController.abort();
    release(new ArrayBuffer(0));
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(test.container.childElementCount).toBe(0);
  });
});
