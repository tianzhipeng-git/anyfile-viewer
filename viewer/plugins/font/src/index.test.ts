import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createViewerTestContext } from "@anyfile/viewer-test";

import { fontViewer } from "./index";

const sample = async (name = "Abel-Regular.ttf") => new File([await readFile(`examples/${name}`)], name);

class FakeFontFace {
  static instances: FakeFontFace[] = [];
  status = "unloaded";
  constructor(readonly family: string, readonly source: ArrayBuffer) { FakeFontFace.instances.push(this); }
  async load() { this.status = "loaded"; return this; }
}

const fonts = { add: vi.fn(), delete: vi.fn() };

beforeEach(() => {
  FakeFontFace.instances = [];
  fonts.add.mockClear();
  fonts.delete.mockClear();
  vi.stubGlobal("FontFace", FakeFontFace);
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("font viewer", () => {
  it("opens a real font, renders the specimen and releases it on dispose", async () => {
    const test = createViewerTestContext(await sample());
    const controller = await fontViewer.open(test.context);
    const root = test.container.querySelector<HTMLElement>(".anyfile-font-viewer")!;
    expect(root.textContent).toContain("Abel");
    expect(test.container.textContent).toContain("Version 1.003");
    expect(fonts.add).toHaveBeenCalledWith(FakeFontFace.instances[0]);
    expect(root.querySelector<HTMLElement>(".anyfile-font-viewer__line")!.style.fontFamily).toContain(FakeFontFace.instances[0].family);

    controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(fonts.delete).toHaveBeenCalledTimes(1);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
    controller.dispose();
    expect(fonts.delete).toHaveBeenCalledTimes(1);
    test.cleanup();
  });

  it("retypes the specimen", async () => {
    const test = createViewerTestContext(await sample("Abel-Regular.woff"));
    const controller = await fontViewer.open(test.context);
    const input = test.container.querySelector("input")!;
    input.value = "Xyz 2026";
    input.dispatchEvent(new Event("input"));
    for (const line of test.container.querySelectorAll(".anyfile-font-viewer__section--preview .anyfile-font-viewer__line")) expect(line.textContent).toBe("Xyz 2026");
    expect(test.container.querySelectorAll(".anyfile-font-viewer__section--glyphs .anyfile-font-viewer__line")[0].textContent).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    controller.dispose();
    test.cleanup();
  });

  it("rejects files that are not fonts and cleans up", async () => {
    const test = createViewerTestContext(new File(["not a font"], "fake.ttf"));
    await expect(fontViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(test.container.childElementCount).toBe(0);
    test.cleanup();
  });

  it("enforces the input limit before reading", async () => {
    const file = await sample();
    Object.defineProperty(file, "size", { value: 64 * 1024 * 1024 });
    const test = createViewerTestContext(file);
    await expect(fontViewer.open(test.context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(test.container.childElementCount).toBe(0);
    test.cleanup();
  });

  it("reports an unsupported environment without FontFace", async () => {
    vi.stubGlobal("FontFace", undefined);
    const test = createViewerTestContext(await sample());
    await expect(fontViewer.open(test.context)).rejects.toMatchObject({ code: "unsupported-environment" });
    test.cleanup();
  });

  it("maps a rejected FontFace load to invalid-file", async () => {
    vi.stubGlobal("FontFace", class { constructor() {} async load() { throw new SyntaxError("bad font"); } });
    const test = createViewerTestContext(await sample());
    await expect(fontViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(fonts.delete).toHaveBeenCalled();
    test.cleanup();
  });

  it("cancels while opening and while active", async () => {
    const opening = createViewerTestContext(await sample());
    opening.abortController.abort();
    await expect(fontViewer.open(opening.context)).rejects.toMatchObject({ name: "AbortError" });
    expect(opening.container.childElementCount).toBe(0);
    opening.cleanup();

    const active = createViewerTestContext(await sample());
    const controller = await fontViewer.open(active.context);
    expect(active.container.childElementCount).toBe(1);
    active.abortController.abort();
    expect(active.container.childElementCount).toBe(0);
    expect(fonts.delete).toHaveBeenCalledTimes(1);
    await controller.dispose();
    expect(fonts.delete).toHaveBeenCalledTimes(1);
    active.cleanup();
  });
});
