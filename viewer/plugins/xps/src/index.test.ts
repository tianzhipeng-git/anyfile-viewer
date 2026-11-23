import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerError } from "@anyfile/viewer-protocol";
import { createViewerTestContext, truncated, type ViewerTestContext } from "@anyfile/viewer-test";

import { xpsViewer } from "./index";
import { buildXps } from "./test-fixtures";

const contexts: ViewerTestContext[] = [];

function context(file: File) {
  const result = createViewerTestContext(file);
  contexts.push(result);
  return result;
}

function sampleBytes(name: string) {
  return new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ViewerError);
  expect((error as ViewerError).code).toBe(code);
}

beforeEach(() => {
  // happy-dom has no Path2D; rendering is covered by painter tests with a recording context.
  vi.stubGlobal("Path2D", class { addPath() {} });
});

afterEach(() => {
  for (const item of contexts.splice(0)) item.cleanup();
  vi.unstubAllGlobals();
});

describe("XPS viewer", () => {
  it("opens a Microsoft XPS Document Writer file into the paged viewport and disposes idempotently", async () => {
    const test = context(new File([sampleBytes("testPPT.xps")], "testPPT.xps"));
    const preview = vi.fn();
    const controller = await xpsViewer.open({ ...test.context, reportPreview: preview });

    expect(test.container.querySelector(".anyfile-xps-viewer")).not.toBeNull();
    expect(test.container.querySelectorAll(".anyfile-paged-viewer__page")).toHaveLength(3);
    // FixedPage 1 is 960×720 (PowerPoint 4:3 slide at 96 dpi).
    const first = test.container.querySelector<HTMLElement>('[data-page="0"]');
    expect(Number.parseFloat(first!.style.height) / Number.parseFloat(first!.style.width)).toBeCloseTo(0.75, 2);
    expect(test.progress.map((item) => item.stage)).toEqual(["reading", "parsing", "ready"]);
    expect(preview).toHaveBeenCalledWith({ outcome: "success", kind: "static" });
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
  });

  it("shows the OpenXPS DocumentStructure outline", async () => {
    const test = context(buildXps({ openXps: true, pieces: true }));
    await xpsViewer.open(test.context);
    const entries = Array.from(test.container.querySelectorAll(".anyfile-paged-viewer__outline-btn"), (node) => node.textContent);
    expect(entries).toEqual(expect.arrayContaining(["Intro", "Details"]));
    expect(test.container.querySelectorAll(".anyfile-paged-viewer__page")).toHaveLength(2);
  });

  it("rejects disguised, truncated and page-less packages without leaving DOM behind", async () => {
    const disguised = context(new File(["%PDF-1.7\n"], "disguised.xps"));
    await expectCode(xpsViewer.open(disguised.context), "invalid-file");
    expect(disguised.container.childElementCount).toBe(0);

    const cut = context(new File([truncated(sampleBytes("testPPT.xps"), 40_000).slice().buffer as ArrayBuffer], "truncated.xps"));
    await expectCode(xpsViewer.open(cut.context), "invalid-file");
    expect(cut.container.childElementCount).toBe(0);

    const empty = context(buildXps({ overrides: { "Documents/1/Pages/1.fpage": null, "Documents/1/Pages/2.fpage": null } }));
    await expectCode(xpsViewer.open(empty.context), "invalid-file");

    const notPage = context(buildXps({ overrides: { "Documents/1/Pages/1.fpage": "<Canvas xmlns='x'/>" } }));
    await expectCode(xpsViewer.open(notPage.context), "invalid-file");
  });

  it("enforces input and per-page element limits", async () => {
    const big = buildXps();
    Object.defineProperty(big, "size", { value: 600 * 1024 * 1024 });
    await expectCode(xpsViewer.open(context(big).context), "resource-limit");

    const deep = `${"<Canvas>".repeat(80)}${"</Canvas>".repeat(80)}`;
    const nested = buildXps({
      overrides: { "Documents/1/Pages/1.fpage": `<FixedPage xmlns="http://schemas.microsoft.com/xps/2005/06" Width="10" Height="10">${deep}</FixedPage>`.replace(/<Canvas>/g, '<Canvas xmlns="http://schemas.microsoft.com/xps/2005/06">') },
    });
    await expectCode(xpsViewer.open(context(nested).context), "resource-limit");
  });

  it("reports unsupported environments and honours aborts before and during opening", async () => {
    vi.stubGlobal("Path2D", undefined);
    await expectCode(xpsViewer.open(context(buildXps()).context), "unsupported-environment");
    vi.stubGlobal("Path2D", class { addPath() {} });

    const early = context(buildXps());
    early.abortController.abort();
    await expect(xpsViewer.open(early.context)).rejects.toMatchObject({ name: "AbortError" });

    const during = context(buildXps());
    const opening = xpsViewer.open(during.context);
    during.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(during.container.childElementCount).toBe(0);

    const active = context(buildXps());
    await xpsViewer.open(active.context);
    active.abortController.abort();
    expect(active.container.childElementCount).toBe(0);
  });
});
