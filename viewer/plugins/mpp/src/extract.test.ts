// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";
import { createNodeVendorAssets } from "@anyfile/runtime-assets/node";
import { describe, expect, it } from "vitest";
import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
function contextFor(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, name)));
  return { source: createBufferBinarySource(bytes, name), file: new File([bytes], name), vendor: createNodeVendorAssets(), signal: new AbortController().signal };
}

describe("mpp ./extract (mppgo WASM in Node)", () => {
  it("passes extractor compliance on real Project 2010/2016 files", async () => {
    const header = new Uint8Array(512);
    header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await assertExtractorCompliance(extractor, [
      { name: "task-links-2016.mpp", filePath: resolve(EXAMPLES, "task-links-2016.mpp"), targetId: "tasks", filter: "task", smallMaxBytes: 300, invalidBytes: header },
      { name: "task-dates-2010.mpp", filePath: resolve(EXAMPLES, "task-dates-2010.mpp") },
      { name: "resource-type-2016.mpp", filePath: resolve(EXAMPLES, "resource-type-2016.mpp"), targetId: "resources" },
      { name: "gantt.mpp", filePath: resolve(EXAMPLES, "gantt.mpp"), targetId: "assignments" },
    ]);
  }, 30_000);

  it("reads tasks with dates, durations and predecessors", async () => {
    const context = contextFor("task-links-2016.mpp");
    const inspected = await extractor.inspect(context);
    expect(inspected.targets.map((target) => target.id)).toEqual(["tasks", "resources", "assignments"]);
    const tasks = (await extractor.read(context, { maxBytes: 48 * 1024 })).content;
    expect(tasks).toMatch(/\| 4 \|.*\| 3FS\+1d \|/);
    expect(tasks).toContain("SS");

    const dates = await extractor.read(contextFor("task-dates-2010.mpp"), { target: "tasks", filter: "Date1", maxBytes: 48 * 1024 });
    expect(dates.content).toContain("| 1 | 1 | 1 | Date1 | 2014-10-31 08:00 | 2014-10-31 17:00 | 1d |");
  });

  it("defaults to resources for a resource-only plan and maps legacy MPP12 to invalid-file", async () => {
    const resources = contextFor("resource-type-2016.mpp");
    expect((await extractor.inspect(resources)).metadata).toMatchObject({ tasks: 0 });
    expect((await extractor.read(resources, { maxBytes: 4096 })).content).toContain("| 1 | Cost Resource 1 | Cost |");
    await expect(extractor.inspect(contextFor("unsupported-mpp12.mpp"))).rejects.toMatchObject({ code: "invalid-file", message: expect.stringMatching(/MPP14/) });
  });
});
