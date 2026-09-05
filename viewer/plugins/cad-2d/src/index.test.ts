import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { cad2dViewer } from "./index";
// Protocol tests use the real parser/adapter; WebGL is covered by browser smoke.
vi.mock("@anyfile/rendering-3d", async (original) => {
  const actual = await original<typeof import("@anyfile/rendering-3d")>();
  return { ...actual, create3dViewer(container: HTMLElement, document: Parameters<typeof actual.create3dViewer>[1]) {
    actual.inspectObject(document.root);
    const root = window.document.createElement("div"); root.append(window.document.createElement("canvas")); container.append(root);
    return { root, dispose() { actual.disposeObject(document.root); root.remove(); } };
  } };
});
vi.mock("./parse", async () => ({ readCadScene: (source: string) => import("./scene").then(module => module.parseCadScene(source)) }));
const contexts: ViewerTestContext[] = [];
function contextFor(file: File) { const context = createViewerTestContext(file); contexts.push(context); return context; }
afterEach(() => { for (const context of contexts.splice(0)) context.cleanup(); });
describe("DXF protocol", () => {
  it("opens and cleans on active abort and repeated dispose", async () => {
    const context = contextFor(new File([readFileSync(join(process.cwd(), "examples/sample.dxf"))], "sample.dxf"));
    const controller = await cad2dViewer.open(context.context);
    expect(context.container.querySelector("canvas")).toBeTruthy();
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    context.abortController.abort(); await controller.dispose(); await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
  });
  it("rejects invalid and oversized input", async () => {
    const invalid = contextFor(new File(["plain text"], "bad.dxf"));
    await expect(cad2dViewer.open(invalid.context)).rejects.toMatchObject({ code: "invalid-file" });
    const file = new File(["0\nEOF\n"], "large.dxf"); Object.defineProperty(file, "size", { value: 65 * 1024 * 1024 });
    await expect(cad2dViewer.open(contextFor(file).context)).rejects.toMatchObject({ code: "resource-limit" });
  });
});
