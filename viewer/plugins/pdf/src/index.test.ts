import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import {
  createDeferredFile,
  createViewerTestContext,
  type ViewerTestContext,
} from "@anyfile/viewer-test";

import { pdfViewer } from "./index";
import { pdfManifest } from "./manifest";

const activeContexts: ViewerTestContext[] = [];

function testContext(file: File) {
  const result = createViewerTestContext(file);
  activeContexts.push(result);
  return result;
}

function validPdf() {
  return new File(["%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"], "document.pdf", {
    type: "application/pdf",
  });
}

afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
});

describe("PDF viewer protocol compliance", () => {
  it("publishes a valid v1 manifest", () => {
    expect(() => validateManifest(pdfManifest)).not.toThrow();
    expect(pdfManifest.formats.flatMap((format) => format.extensions)).toEqual([".pdf"]);
  });

  it("opens through a sliced read and releases its Object URL on repeated dispose", async () => {
    const file = validPdf();
    const directRead = vi.spyOn(file, "arrayBuffer");
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank#pdf-test");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const fetchRequest = vi.spyOn(globalThis, "fetch");
    const context = testContext(file);

    const controller = await pdfViewer.open(context.context);

    expect(context.container.querySelector("iframe")?.getAttribute("src")).toBe("about:blank#pdf-test");
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    expect(directRead).not.toHaveBeenCalled();
    expect(fetchRequest).not.toHaveBeenCalled();
    expect(createObjectUrl).toHaveBeenCalledOnce();

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
  });

  it("cleans partial state when opening an invalid file fails", async () => {
    const context = testContext(new File(["not a pdf"], "broken.pdf"));

    await expect(pdfViewer.open(context.context)).rejects.toMatchObject({
      code: "invalid-file",
    });
    expect(context.container.childElementCount).toBe(0);
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("honors cancellation during opening", async () => {
    const deferred = createDeferredFile("delayed.pdf", 40);
    const context = testContext(deferred.file);
    const opening = pdfViewer.open(context.context);

    context.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(deferred.wasCancelled()).toBe(true);
    expect(context.container.childElementCount).toBe(0);
  });

  it("uses the requested locale for user-facing errors", async () => {
    const context = testContext(new File(["not a pdf"], "broken.pdf"));
    const localizedContext = { ...context.context, locale: "en-US" };

    await expect(pdfViewer.open(localizedContext)).rejects.toMatchObject({
      code: "invalid-file",
      message: "The file is not a valid PDF document.",
    });
  });

  it("disposes immediately when an active viewer is aborted", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank#active-pdf");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const context = testContext(validPdf());
    const controller = await pdfViewer.open(context.context);

    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    expect(revokeObjectUrl).toHaveBeenCalledOnce();

    await controller.dispose();
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
  });
});
