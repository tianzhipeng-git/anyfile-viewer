import { expect, it, vi } from "vitest";
import type { OpenViewerContext } from "@anyfile/viewer-protocol";
import { mesh3dViewer } from "./index";

vi.mock("@anyfile/rendering-3d", () => ({
  create3dViewer: vi.fn(() => ({ dispose: vi.fn() })),
  disposeObject: vi.fn(),
}));

function context(name: string, size: number, source = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n") {
  const arrayBuffer = vi.fn(async () => new TextEncoder().encode(source).buffer);
  return {
    file: { name, size, arrayBuffer } as unknown as File,
    container: document.createElement("div"),
    signal: new AbortController().signal,
    locale: "en",
    reportProgress: vi.fn(),
  } satisfies OpenViewerContext;
}

// Declared sizes test the input gate without allocating hundreds of MiB.
it.each([64 * 1024 * 1024 + 1, 256 * 1024 * 1024])("opens OBJ with declared input size %i", async size => {
  const ctx = context("model.OBJ", size);
  const viewer = await mesh3dViewer.open(ctx);
  expect(ctx.file.arrayBuffer).toHaveBeenCalledOnce();
  await viewer.dispose();
  await viewer.dispose();
});

it.each([ ["model.obj", 256], ["model.ply", 128] ])("rejects oversized %s before reading", async (name, limit) => {
  const ctx = context(name as string, (limit as number) * 1024 * 1024 + 1);
  await expect(mesh3dViewer.open(ctx)).rejects.toMatchObject({ code: "resource-limit", message: `The model file exceeds the ${limit} MiB input limit.` });
  expect(ctx.file.arrayBuffer).not.toHaveBeenCalled();
});

it("does not label geometry exhaustion as an input size failure", async () => {
  const ctx = context("model.obj", 20000, "g x\n".repeat(4097));
  await expect(mesh3dViewer.open(ctx)).rejects.toMatchObject({ code: "resource-limit", message: "The model exceeds a geometry, material, texture or parser memory limit." });
});

it("rejects cancellation before reading", async () => {
  const ctx = context("model.obj", 100);
  const controller = new AbortController();
  controller.abort();
  await expect(mesh3dViewer.open({ ...ctx, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(ctx.file.arrayBuffer).not.toHaveBeenCalled();
});
