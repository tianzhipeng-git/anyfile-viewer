import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest, type Locale } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { pstViewer } from "./index";
import { pstManifest } from "./manifest";

const sample = new Uint8Array(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../examples/dist-list.pst")));
const contexts: ViewerTestContext[] = [];

function contextFor(contents: BlobPart, name = "mailbox.pst", locale: Locale = "zh-CN") {
  const test = createViewerTestContext(new File([contents], name));
  contexts.push(test);
  return { ...test, context: { ...test.context, locale } };
}

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
});

describe("Outlook PST viewer", () => {
  it("publishes a valid manifest for .pst and .ost", () => {
    expect(() => validateManifest(pstManifest)).not.toThrow();
    expect(pstManifest.formats.flatMap(({ extensions }) => extensions)).toEqual([".pst", ".ost"]);
  });

  it("opens the default folder and reads a message", async () => {
    const test = contextFor(sample.slice(), "mailbox.pst", "en");
    const reportPreview = vi.fn();
    const controller = await pstViewer.open({ ...test.context, reportPreview });
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(reportPreview).toHaveBeenCalledExactlyOnceWith({ outcome: "success", kind: "structure" });
    expect(test.container.textContent).toContain("Top of Personal Folders");

    await vi.waitFor(() => expect(test.container.querySelector("[data-pst-row]")).not.toBeNull());
    expect(test.container.querySelector('[aria-current="true"]')?.textContent).toContain("Calendar");
    const row = test.container.querySelector<HTMLElement>("[data-pst-row]")!;
    expect(row.textContent).toContain("Test appointment");
    row.click();
    await vi.waitFor(() => expect(test.container.querySelector(".anyfile-pst__text")?.textContent).toBe("This is a complete test\r\n"));
    expect(test.container.textContent).toContain("IPM.Appointment");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("lists another folder on selection", async () => {
    const test = contextFor(sample.slice());
    await pstViewer.open(test.context);
    await vi.waitFor(() => expect(test.container.textContent).toContain("Contacts"));
    const contacts = Array.from(test.container.querySelectorAll<HTMLElement>("[data-pst-folder]")).find((button) => button.textContent?.startsWith("Contacts"))!;
    contacts.click();
    await vi.waitFor(() => expect(test.container.textContent).toContain("test dist list"));
    expect(test.container.querySelectorAll("[data-pst-row]")).toHaveLength(2);
  });

  it("rejects a non-PST file with a localized error and leaves no DOM", async () => {
    const zh = contextFor(new Uint8Array(2048), "fake.pst", "zh-CN");
    await expect(pstViewer.open(zh.context)).rejects.toMatchObject({ code: "invalid-file", message: expect.stringContaining("PST/OST") });
    expect(zh.container.childElementCount).toBe(0);

    const cyclic = sample.slice();
    cyclic[513] = 2;
    const en = contextFor(cyclic, "cyclic.pst", "en");
    await expect(pstViewer.open(en.context)).rejects.toMatchObject({ code: "open-failed", message: expect.stringContaining("cyclic") });
    expect(en.container.childElementCount).toBe(0);
  });

  it("disposes the view when aborted after opening", async () => {
    const test = contextFor(sample.slice());
    await pstViewer.open(test.context);
    expect(test.container.childElementCount).toBe(1);
    test.abortController.abort();
    expect(test.container.childElementCount).toBe(0);
  });

  it("cancels a pending read during opening", async () => {
    let release!: (value: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>((resolve) => { release = resolve; });
    const file = { name: "pending.pst", size: 1 << 20, slice() { return { arrayBuffer: () => pending }; } } as unknown as File;
    const test = createViewerTestContext(file);
    contexts.push(test);
    const opening = pstViewer.open(test.context);
    test.abortController.abort();
    release(sample.slice(0, 1024).buffer);
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(test.container.childElementCount).toBe(0);
  });
});
