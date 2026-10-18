import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { readMindMap, type Topic } from "./parse";
import { mindMapViewer } from "./index";
import { probeMindMap } from "./probe";

// Opt-in: public samples remain outside the repository; no network access in tests.
const directory = process.env.MIND_MAP_PUBLIC_SAMPLES;
interface Sample { path: string; source: string; sha256: string; expectedTopics: number; expectedSheets: number; format: string; expectedOutcome: "open" | "reject" }
const samples: Sample[] = directory ? JSON.parse(readFileSync(join(directory, "samples.json"), "utf8")) : [];

describe.skipIf(!directory)("downloaded public mind maps", () => {
  it("parses and opens every sample, checks independent topic counts, and cleans up", async () => {
    const results: object[] = [];
    const failures: string[] = [];
    for (const sample of samples) {
      const bytes = readFileSync(join(directory!, sample.path));
      expect(createHash("sha256").update(bytes).digest("hex"), sample.path).toBe(sample.sha256);
      const file = new File([bytes], basename(sample.path));
      const test = createViewerTestContext(file);
      const start = performance.now();
      try {
        if (sample.expectedOutcome === "reject") {
          expect(await probeMindMap({ file, signal: test.context.signal })).toBe(0);
          await expect(mindMapViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
          expect(test.container.childElementCount).toBe(0);
          results.push({ ...sample, result: "expected-rejection", bytes: file.size });
          continue;
        }
        expect(await probeMindMap({ file, signal: test.context.signal })).toBe(3);
        const sheets = await readMindMap(file, test.context.signal);
        let topics = 0, notes = 0, links = 0, emptyTitles = 0;
        const visit = (node: Topic) => {
          topics++; if (node.notes) notes++; if (node.link) links++; if (!node.title) emptyTitles++;
          node.children.forEach(visit);
        };
        sheets.forEach(sheet => visit(sheet.root));
        expect(topics, sample.path).toBe(sample.expectedTopics);
        expect(sheets.length, sample.path).toBe(sample.expectedSheets);
        const controller = await mindMapViewer.open(test.context);
        expect(test.container.querySelector("h2")?.textContent).toBe(sheets[0].root.title || "未命名主题");
        const first = test.container.querySelectorAll(".mm-node")[1];
        if (first) {
          first.dispatchEvent(new MouseEvent("click"));
          expect(test.container.querySelector("h2")?.textContent).toBe(first.getAttribute("aria-label"));
        }
        test.abortController.abort(); await controller.dispose(); await controller.dispose();
        expect(test.container.childElementCount).toBe(0);
        expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
        results.push({ ...sample, result: "pass", bytes: file.size, sheets: sheets.length, topics, notes, links, emptyTitles, elapsedMs: Math.round(performance.now() - start) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ ...sample, result: "fail", error: message }); failures.push(`${sample.path}: ${message}`);
      } finally { test.cleanup(); }
    }
    writeFileSync(join(directory!, "results.json"), JSON.stringify(results, null, 2) + "\n");
    expect(samples.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 120_000);
});
