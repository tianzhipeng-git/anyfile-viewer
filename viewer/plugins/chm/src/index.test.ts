import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { readChmMetadata } from "./chm-metadata";
import { parseChmDirectory } from "./itsf";
import { createChmSectionReader, parseControlData, parseResetTable } from "./section-reader";
import { chmViewer } from "./index";
import { probeChm } from "./probe";

const contexts: ReturnType<typeof createViewerTestContext>[] = [];
const signal = () => new AbortController().signal;

function exampleFile(name: string): File {
  return new File([readFileSync(resolve(__dirname, "../examples", name))], name);
}

afterEach(() => {
  for (const ctx of contexts.splice(0)) ctx.cleanup();
  vi.restoreAllMocks();
});

describe("CHM reader", () => {
  it("probes valid CHM headers with bounded slice reads and rejects disguised/truncated files", async () => {
    for (const name of ["sample-handbook.chm", "cjk-gbk.chm", "malicious-sandbox.chm"]) {
      const file = exampleFile(name);
      vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("Whole file read forbidden"));
      expect(await probeChm({ file, signal: signal() })).toBe(4);
    }

    expect(await probeChm({ file: exampleFile("truncated-header.chm"), signal: signal() })).toBe(0);
    expect(await probeChm({ file: exampleFile("disguised-text.chm"), signal: signal() })).toBe(0);
  });

  it("parses ITSF/ITSP directory, LZX Verbatim topics, contents tree, and keyword index", async () => {
    const file = exampleFile("sample-handbook.chm");
    const dir = await parseChmDirectory(file, signal());
    expect(dir.version).toBe(3);
    expect(dir.byLowerPath.has("/topics/getting started.html")).toBe(true);

    const reader = createChmSectionReader(file, dir);
    const meta = await readChmMetadata(dir, reader, signal());
    expect(meta.title).toBe("Anyfile CHM Handbook");
    expect(meta.defaultTopic).toBe("/topics/getting started.html");
    expect(meta.tocTree).toHaveLength(1);
    expect(meta.tocTree[0].label).toBe("Welcome");
    expect(meta.tocTree[0].children.map((c) => c.label)).toEqual(["Architecture", "Reference"]);
    expect(meta.indexEntries.map((e) => e.label)).toEqual(["Getting Started", "PNG Diagram", "Limits"]);

    const entry = dir.byExactPath.get("/topics/architecture.html")!;
    const html = new TextDecoder().decode(await reader.readEntry(entry, 1024 * 1024, signal()));
    expect(html).toContain("Architecture Overview");
    expect(html).toContain("../assets/diagram.png");
    reader.dispose();
  });

  it("decodes GBK CJK CHM topics, non-ASCII paths, and BMP images", async () => {
    const test = createViewerTestContext(exampleFile("cjk-gbk.chm"));
    contexts.push(test);

    const createUrl = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:chm-${Math.random()}`);
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const controller = await chmViewer.open(test.context);
    expect(test.container.querySelector(".anyfile-chm-reader")).not.toBeNull();
    expect(test.container.textContent).toContain("中文帮助文档");
    expect(test.container.textContent).toContain("中文目录首页");

    await vi.waitFor(() => {
      const frame = test.container.querySelector("iframe") as HTMLIFrameElement | null;
      expect(frame).not.toBeNull();
      expect(frame!.srcdoc).toContain("中文帮助手册");
    });
    const frame = test.container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame.srcdoc).toContain("blob:chm-");

    await controller.dispose();
    expect(revokeUrl).toHaveBeenCalledTimes(createUrl.mock.calls.length);
  });

  it("renders sidebar navigation, back/forward history, and sanitizes unsafe content", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:sec-${Math.random()}`);
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const test = createViewerTestContext(exampleFile("malicious-sandbox.chm"));
    contexts.push(test);

    const controller = await chmViewer.open({ ...test.context, locale: "en" });
    await vi.waitFor(() => {
      const frame = test.container.querySelector("iframe") as HTMLIFrameElement | null;
      expect(frame).not.toBeNull();
      expect(frame!.srcdoc).toContain("Safe paragraph remains readable.");
    });
    const frame = test.container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.srcdoc).toContain("Unsupported embedded object");
    expect(frame.srcdoc).toContain("Content-Security-Policy");
    expect(frame.srcdoc).not.toMatch(/__chmAttack|evil\.invalid|<script|<iframe|<form|<object|onerror|javascript:|ms-its:/i);

    // Wait for async missing-resource warning banner on the slot.
    await vi.waitFor(() => {
      expect(test.container.textContent).toContain("missing");
    });

    await controller.dispose();
    await controller.dispose();
    expect(test.container.children).toHaveLength(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
    expect(revokeUrl).toHaveBeenCalledTimes(createUrl.mock.calls.length);
  });

  it("supports sidebar contents/index navigation and back/forward buttons", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:nav-${Math.random()}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const test = createViewerTestContext(exampleFile("sample-handbook.chm"));
    contexts.push(test);
    const controller = await chmViewer.open(test.context);

    const backBtn = Array.from(test.container.querySelectorAll("button")).find(
      (b) => b.textContent === "返回正文",
    ) as HTMLButtonElement;
    const forwardBtn = Array.from(test.container.querySelectorAll("button")).find(
      (b) => b.textContent === "前进",
    ) as HTMLButtonElement;
    const refBtn = Array.from(test.container.querySelectorAll(".anyfile-publication-reader__sidebar button")).find(
      (b) => b.textContent === "Reference",
    ) as HTMLButtonElement;

    expect(backBtn.disabled).toBe(true);
    expect(forwardBtn.disabled).toBe(true);
    refBtn.click();
    expect(backBtn.disabled).toBe(false);
    backBtn.click();
    expect(forwardBtn.disabled).toBe(false);
    forwardBtn.click();
    expect(backBtn.disabled).toBe(false);

    await controller.dispose();
  });

  it("rejects corrupt, truncated, disguised, and oversized inputs with proper error codes", async () => {
    for (const bad of ["corrupt-loop.chm", "truncated-header.chm", "disguised-text.chm"]) {
      const ctx = createViewerTestContext(exampleFile(bad));
      contexts.push(ctx);
      await expect(chmViewer.open(ctx.context)).rejects.toMatchObject({ code: "invalid-file" });
      expect(ctx.container.children).toHaveLength(0);
    }

    const oversized = exampleFile("sample-handbook.chm");
    Object.defineProperty(oversized, "size", { value: 128 * 1024 * 1024 + 1 });
    const limitCtx = createViewerTestContext(oversized);
    contexts.push(limitCtx);
    await expect(chmViewer.open(limitCtx.context)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("rejects malformed ControlData and ResetTable headers", () => {
    const badCtrl = new Uint8Array(28);
    badCtrl.set([6, 0, 0, 0, 0x4c, 0x5a, 0x58, 0x43, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0]);
    expect(() => parseControlData(badCtrl)).toThrow(expect.objectContaining({ code: "invalid-file" }));

    const badRt = new Uint8Array(40);
    new DataView(badRt.buffer).setUint32(0, 99, true);
    expect(() => parseResetTable(badRt, 1024)).toThrow(expect.objectContaining({ code: "invalid-file" }));
  });

  it("stops cleanly on opening abort and active abort without late progress", async () => {
    const ctx = createViewerTestContext(exampleFile("sample-handbook.chm"));
    contexts.push(ctx);
    const controller = await chmViewer.open(ctx.context);
    const progressCount = ctx.progress.length;

    ctx.abortController.abort();
    await controller.dispose();
    await new Promise((r) => setTimeout(r, 15));

    expect(ctx.container.children).toHaveLength(0);
    expect(ctx.progress).toHaveLength(progressCount);
    await expect(chmViewer.open(ctx.context)).rejects.toMatchObject({ name: "AbortError" });
  });

  const externalDir = process.env.CHM_TEST_DIR;
  it.skipIf(!externalDir)("validates real Microsoft CHMs and libmspack CVE fixtures when CHM_TEST_DIR is set", async () => {
    for (const name of ["example.chm", "combined.chm", "combined2.chm"]) {
      const fullPath = join(externalDir!, name);
      if (!existsSync(fullPath)) continue;
      const input = new File([readFileSync(fullPath)], name);
      expect(await probeChm({ file: input, signal: signal() })).toBe(4);
      const ctx = createViewerTestContext(input);
      contexts.push(ctx);
      const controller = await chmViewer.open(ctx.context);
      await vi.waitFor(() => {
        const frame = ctx.container.querySelector("iframe") as HTMLIFrameElement | null;
        expect(frame).not.toBeNull();
        expect(frame!.srcdoc.length).toBeGreaterThan(50);
      });
      await controller.dispose();
    }

    for (const bad of [
      "cve/pmgl-infinite-loop.chm",
      "cve/cve-2017-6419-lzx-negative-spaninfo.chm",
      "cve/cve-2018-14680-blank-filenames.chm",
      "cve/negative-off64-chm-length.chm",
    ]) {
      const fullPath = join(externalDir!, bad);
      if (!existsSync(fullPath)) continue;
      const input = new File([readFileSync(fullPath)], bad);
      const ctx = createViewerTestContext(input);
      contexts.push(ctx);
      await expect(chmViewer.open(ctx.context)).rejects.toMatchObject({ code: "invalid-file" });
    }
  });
});
