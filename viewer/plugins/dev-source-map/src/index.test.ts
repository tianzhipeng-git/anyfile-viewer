import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { validateManifest } from "@anyfile/viewer-protocol";

import { devSourceMapViewer } from "./index";
import { devSourceMapManifest } from "./manifest";

const contexts: ViewerTestContext[] = [];
afterEach(() => { for (const context of contexts.splice(0)) context.cleanup(); });

function context(value: unknown, name = "bundle.js.map") {
  const content = typeof value === "string" ? value : JSON.stringify(value);
  const result = createViewerTestContext(new File([content], name));
  contexts.push(result);
  return result;
}

describe("dev source map viewer", () => {
  it("publishes a valid manifest", () => expect(() => validateManifest(devSourceMapManifest)).not.toThrow());

  it("renders sources, embedded content, ignore lists, coverage, and position queries", async () => {
    const test = context({
      version: 3, file: "bundle.js", sourceRoot: "/Users/alice/project/src", sources: ["index.ts"],
      sourcesContent: ["const answer = 42;"], names: ["answer"], ignoreList: [0], mappings: "AAAAA",
    });
    const controller = await devSourceMapViewer.open(test.context);
    expect(test.container.textContent).toContain("ECMA-426 映射预览");
    expect(test.container.textContent).toContain("…/project/src/index.ts");
    expect(test.container.textContent).toContain("const answer = 42;");
    expect(test.container.textContent).toContain("有效映射1");
    const form = test.container.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(test.container.textContent).toContain("index.ts:1:0 · answer");
    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
  });

  it("supports inline indexed maps and records external sections without fetching", async () => {
    const test = context({ version: 3, sections: [
      { offset: { line: 0, column: 0 }, map: { version: 3, sources: ["first.ts"], names: [], mappings: "AAAA" } },
      { offset: { line: 2, column: 4 }, map: { version: 3, sources: ["second.ts"], names: [], mappings: "AAAA" } },
      { offset: { line: 4, column: 0 }, url: "https://example.invalid/remote.map" },
    ] });
    const fetchBefore = globalThis.fetch;
    const controller = await devSourceMapViewer.open(test.context);
    expect(test.container.textContent).toContain("Indexed sections3");
    expect(test.container.textContent).toContain("未加载外部 section");
    expect(globalThis.fetch).toBe(fetchBefore);
    await controller.dispose();
  });

  it("rejects damaged JSON, malformed VLQ, invalid indexed offsets, and over-limit input", async () => {
    await expect(devSourceMapViewer.open(context("{", "broken.map").context)).rejects.toMatchObject({ code: "invalid-file" });
    await expect(devSourceMapViewer.open(context({ version: 3, sources: [], names: [], mappings: "g" }).context))
      .rejects.toMatchObject({ code: "invalid-file" });
    await expect(devSourceMapViewer.open(context({ version: 3, sections: [
      { offset: { line: 1, column: 0 }, map: { version: 3, sources: [], names: [], mappings: "" } },
      { offset: { line: 0, column: 0 }, map: { version: 3, sources: [], names: [], mappings: "" } },
    ] }).context)).rejects.toMatchObject({ code: "invalid-file" });
    const tooLarge = { name: "huge.map", size: 32 * 1024 * 1024 + 1 } as File;
    const test = createViewerTestContext(tooLarge);
    contexts.push(test);
    await expect(devSourceMapViewer.open(test.context)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("opens the committed sample and cleans active content on cancellation", async () => {
    const sample = readFileSync(join(process.cwd(), "examples", "sample.js.map"), "utf8");
    const test = context(sample, "sample.js.map");
    const controller = await devSourceMapViewer.open(test.context);
    expect(test.container.textContent).toContain("webpack:///src/index.ts");
    test.abortController.abort();
    expect(test.container.childElementCount).toBe(0);
    await controller.dispose();
  });
});
