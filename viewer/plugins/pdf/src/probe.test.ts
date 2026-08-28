import { describe, expect, it, vi } from "vitest";
import { createDeferredFile } from "@anyfile/viewer-test";

import { probePdf } from "./probe";

describe("PDF probe", () => {
  it("recognizes a PDF marker within the bounded header", async () => {
    const file = new File(["prefix\n%PDF-1.7\n"], "document.pdf");
    const directRead = vi.spyOn(file, "arrayBuffer");

    await expect(probePdf({ file, signal: new AbortController().signal })).resolves.toBe(4);
    expect(directRead).not.toHaveBeenCalled();
    await expect(probePdf({
      file: new File(["not a pdf"], "document.pdf"),
      signal: new AbortController().signal,
    })).resolves.toBe(0);
  });

  it("cancels an unfinished header read", async () => {
    const deferred = createDeferredFile("document.pdf", 1_024);
    const abortController = new AbortController();
    const probing = probePdf({ file: deferred.file, signal: abortController.signal });

    abortController.abort();

    await expect(probing).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
  });
});
