// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest, type Locale } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { scientificDataPlugin } from "./index";
import { scientificDataManifest } from "./manifest";

const contexts: ViewerTestContext[] = [];

function contextFor(name: string, locale: Locale = "en") {
  const buf = readFileSync(resolve("examples", name));
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  const test = createViewerTestContext(new File([copy.buffer], name));
  contexts.push(test);
  return { ...test, context: { ...test.context, locale } };
}

afterEach(() => {
  for (const ctx of contexts.splice(0)) ctx.cleanup();
});

async function flushUi() {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

describe("scientificDataPlugin UI and lifecycle", () => {
  it("publishes a valid manifest", () => {
    expect(() => validateManifest(scientificDataManifest)).not.toThrow();
    expect(scientificDataManifest.id).toBe("scientific-data");
  });

  it("opens ocean-grid.nc, navigates to a 3D dataset, renders slice table and 2D preview tab", async () => {
    const ctx = contextFor("ocean-grid.nc", "en");
    const session = await scientificDataPlugin.open(ctx.context);
    await flushUi();

    expect(ctx.container.textContent).toContain("NetCDF Classic (CDF-1)");
    expect(ctx.container.textContent).toContain("Ocean Grid Classic Sample");

    const tempBtn = ctx.container.querySelector<HTMLButtonElement>('button[data-sci-path="/temp"]');
    expect(tempBtn).not.toBeNull();
    tempBtn!.click();
    await flushUi();

    expect(ctx.container.textContent).toContain("20");
    expect(ctx.container.textContent).toContain("Row axis");

    const heatmapTab = Array.from(ctx.container.querySelectorAll<HTMLButtonElement>("button.anyfile-inspector__tab")).find((b) =>
      b.textContent?.includes("2D Preview"),
    );
    expect(heatmapTab).not.toBeNull();
    heatmapTab!.click();
    await flushUi();
    expect(ctx.container.querySelector("canvas.anyfile-sci__canvas")).not.toBeNull();

    session.dispose();
    session.dispose();
    expect(ctx.container.innerHTML).toBe("");
  });

  it("opens experiment.mat in zh-CN and navigates into nested struct group", async () => {
    const ctx = contextFor("experiment.mat", "zh-CN");
    const session = await scientificDataPlugin.open(ctx.context);
    await flushUi();

    expect(ctx.container.textContent).toContain("容器概览");
    const metaBtn = ctx.container.querySelector<HTMLButtonElement>('button[data-sci-path="/meta"]');
    expect(metaBtn).not.toBeNull();
    metaBtn!.click();
    await flushUi();
    expect(ctx.container.textContent).toContain("instrument");

    session.dispose();
    expect(ctx.container.innerHTML).toBe("");
  });

  it("rejects disguised files and handles abort during and after open", async () => {
    const disguised = contextFor("disguised-text.h5", "en");
    await expect(scientificDataPlugin.open(disguised.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(disguised.container.innerHTML).toBe("");

    const aborted = contextFor("ocean-grid.nc", "en");
    aborted.abortController.abort();
    await expect(scientificDataPlugin.open(aborted.context)).rejects.toThrow();
    expect(aborted.container.innerHTML).toBe("");

    const active = contextFor("ocean-grid.nc", "en");
    await scientificDataPlugin.open(active.context);
    await flushUi();
    expect(active.container.childElementCount).toBeGreaterThan(0);
    active.abortController.abort();
    expect(active.container.innerHTML).toBe("");
  });
});
