import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerError } from "@anyfile/viewer-protocol";
import { createViewerTestContext, truncated, type ViewerTestContext } from "@anyfile/viewer-test";

import { ofdViewer } from "./index";
import { buildOfd } from "./test-fixtures";

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
  // happy-dom has no Path2D; drawing is covered by painter tests with a recording context.
  vi.stubGlobal("Path2D", class { addPath() {} });
});

afterEach(() => {
  for (const item of contexts.splice(0)) item.cleanup();
  vi.unstubAllGlobals();
});

describe("OFD viewer", () => {
  it("opens a real e-invoice into the paged viewport and disposes idempotently", async () => {
    const test = context(new File([sampleBytes("invoice-sample.ofd")], "invoice.ofd"));
    const preview = vi.fn();
    const controller = await ofdViewer.open({ ...test.context, reportPreview: preview });

    expect(test.container.querySelector(".anyfile-ofd-viewer")).not.toBeNull();
    const pages = test.container.querySelectorAll<HTMLElement>(".anyfile-paged-viewer__page");
    expect(pages).toHaveLength(1);
    // The invoice page overrides the A4 document area with 210×140 mm.
    expect(Number.parseFloat(pages[0]!.style.height) / Number.parseFloat(pages[0]!.style.width)).toBeCloseTo(140 / 210, 2);
    expect(test.progress.map((item) => item.stage)).toEqual(["reading", "parsing", "ready"]);
    expect(preview).toHaveBeenCalledWith({ outcome: "success", kind: "static" });
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
  });

  it("shows the document outline", async () => {
    const test = context(buildOfd());
    await ofdViewer.open(test.context);
    const entries = Array.from(test.container.querySelectorAll(".anyfile-paged-viewer__outline-btn"), (node) => node.textContent);
    expect(entries).toEqual(expect.arrayContaining(["Cover", "Body"]));
  });

  it("rejects disguised, truncated and page-less packages without leaving DOM behind", async () => {
    const disguised = context(new File(["%PDF-1.7\n"], "disguised.ofd"));
    await expectCode(ofdViewer.open(disguised.context), "invalid-file");
    expect(disguised.container.childElementCount).toBe(0);

    const bytes = sampleBytes("ses-v4-seal.ofd");
    const cut = context(new File([truncated(bytes, bytes.length - 200).slice().buffer as ArrayBuffer], "truncated.ofd"));
    await expectCode(ofdViewer.open(cut.context), "invalid-file");
    expect(cut.container.childElementCount).toBe(0);

    await expectCode(ofdViewer.open(context(buildOfd({ overrides: { "OFD.xml": null } })).context), "invalid-file");
    const noPages = buildOfd({ overrides: { "Doc_0/Pages/Page_0/Content.xml": null, "Doc_0/Pages/Page_1/Content.xml": null } });
    await expectCode(ofdViewer.open(context(noPages).context), "invalid-file");
    const notPage = buildOfd({ overrides: { "Doc_0/Pages/Page_0/Content.xml": "<Res/>" } });
    await expectCode(ofdViewer.open(context(notPage).context), "invalid-file");
  });

  it("enforces input and nesting limits", async () => {
    const big = buildOfd();
    Object.defineProperty(big, "size", { value: 600 * 1024 * 1024 });
    await expectCode(ofdViewer.open(context(big).context), "resource-limit");

    const deep = `${"<ofd:PageBlock>".repeat(40)}${"</ofd:PageBlock>".repeat(40)}`;
    const nested = buildOfd({ overrides: { "Doc_0/Pages/Page_0/Content.xml": `<ofd:Page xmlns:ofd="x"><ofd:Content><ofd:Layer>${deep}</ofd:Layer></ofd:Content></ofd:Page>` } });
    await expectCode(ofdViewer.open(context(nested).context), "resource-limit");
  });

  it("reports unsupported environments and honours aborts before, during and after opening", async () => {
    vi.stubGlobal("Path2D", undefined);
    await expectCode(ofdViewer.open(context(buildOfd()).context), "unsupported-environment");
    vi.stubGlobal("Path2D", class { addPath() {} });

    const early = context(buildOfd());
    early.abortController.abort();
    await expect(ofdViewer.open(early.context)).rejects.toMatchObject({ name: "AbortError" });

    const during = context(buildOfd());
    const opening = ofdViewer.open(during.context);
    during.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(during.container.childElementCount).toBe(0);

    const active = context(buildOfd());
    await ofdViewer.open(active.context);
    active.abortController.abort();
    expect(active.container.childElementCount).toBe(0);
  });
});
