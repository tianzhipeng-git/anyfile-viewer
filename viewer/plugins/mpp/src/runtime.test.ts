// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProjectDocument } from "./types";

const smoke = fileURLToPath(new URL("../../../../tools/mppgo-build/smoke.mjs", import.meta.url));
function parse(file: string): ProjectDocument & { error?: string } {
  const path = fileURLToPath(new URL(`../examples/${file}`, import.meta.url));
  return JSON.parse(execFileSync(process.execPath, [smoke, path], { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 }).toString());
}
describe("audited browser MPP WASM", () => {
  it("reads real Project 2010 dates matching the corresponding MSPDI export", () => {
    const project = parse("task-dates-2010.mpp");
    expect(project.error).toBeUndefined();
    expect(project.tasks).toHaveLength(10);
    expect(project.tasks[0]).toMatchObject({ id: 1, name: "Date1", level: 1, wbs: "1", start: "2014-10-31T08:00:00", finish: "2014-10-31T17:00:00", duration: { amount: 1, unit: "d" } });
  });
  it("preserves Project 2016 relationship types, IDs and lag", () => {
    const project = parse("task-links-2016.mpp");
    expect(project.error).toBeUndefined();
    expect(project.tasks[1].predecessors).toEqual([{ id: 1, type: "FS", lag: { amount: 0, unit: "d" } }]);
    expect(project.tasks[3].predecessors).toEqual([{ id: 3, type: "FS", lag: { amount: 1, unit: "d" } }]);
    expect(new Set(project.tasks.flatMap(t => t.predecessors.map(p => p.type)))).toEqual(new Set(["FS", "SS", "FF", "SF"]));
  });
  it("opens a resource-only project without inventing tasks", () => {
    const project = parse("resource-type-2016.mpp");
    expect(project.error).toBeUndefined();
    expect(project.tasks).toEqual([]);
    expect(project.resources[0]).toMatchObject({ id: 1, name: "Cost Resource 1", type: "Cost" });
  });
  it("keeps missing current dates empty rather than synthesizing a schedule", () => {
    expect(parse("gantt.mpp").tasks[0]).toMatchObject({ name: "Task One", start: null, finish: null });
  });
  it("rejects a corrupt OLE document without hanging or producing content", () => {
    const temp = mkdtempSync(join(tmpdir(), "anyfile-mpp-test-"));
    try {
      const path = join(temp, "corrupt.mpp"), bytes = new Uint8Array(512);
      bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      writeFileSync(path, bytes);
      expect(JSON.parse(execFileSync(process.execPath, [smoke, path], { timeout: 5000 }).toString())).toEqual({ error: "invalid-file" });
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
  it("rejects legacy Project MPP12 explicitly", () => {
    expect(parse("unsupported-mpp12.mpp")).toEqual({ error: "unsupported-format" });
  });
});
