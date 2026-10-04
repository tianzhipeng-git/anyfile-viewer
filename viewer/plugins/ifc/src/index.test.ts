import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ open: vi.fn(), dispose: vi.fn(), render: vi.fn(), viewerDispose: vi.fn() }));
vi.mock("./worker-client", () => ({ createIfcWorkerClient: async () => ({ open: mocks.open, dispose: mocks.dispose }) }));
vi.mock("./adapter", () => ({ ifcDocument: (data: unknown) => data }));
vi.mock("@anyfile/rendering-3d", () => ({ create3dViewer: mocks.render }));
import { ifcViewer } from "./index";
const header = "ISO-10303-21; HEADER; FILE_SCHEMA(('IFC4')); ENDSEC;";
function context(file = new File([header], "test.ifc")) {
  const controller = new AbortController();
  return { controller, file, signal: controller.signal, container: document.createElement("div"), locale: "en" as const, reportProgress: vi.fn(), reportPreview: vi.fn() };
}
afterEach(() => vi.resetAllMocks());
it("opens, reports preview and releases the parser before rendering; active abort disposes", async () => {
  const ctx = context(); mocks.open.mockResolvedValue({});
  const dispose = vi.fn(); let disposed = false;
  mocks.render.mockReturnValue({ dispose: () => { if (!disposed) { disposed = true; dispose(); } } });
  const viewer = await ifcViewer.open(ctx);
  expect(mocks.dispose).toHaveBeenCalledOnce(); expect(mocks.render).toHaveBeenCalledOnce();
  expect(ctx.reportPreview).toHaveBeenCalledWith({ outcome: "success", kind: "static" });
  ctx.controller.abort(); viewer.dispose(); viewer.dispose(); expect(dispose).toHaveBeenCalledOnce();
});
it("rejects corrupt and oversized input before parsing", async () => {
  await expect(ifcViewer.open(context(new File(["bad"], "test.ifc")))).rejects.toMatchObject({ code: "invalid-file" });
  const ctx = context(); Object.defineProperty(ctx.file, "size", { value: 128 * 1024 * 1024 + 1 });
  await expect(ifcViewer.open(ctx)).rejects.toMatchObject({ code: "resource-limit" });
  expect(mocks.open).not.toHaveBeenCalled();
});
it("cleans the parser after errors and does not render", async () => {
  mocks.open.mockRejectedValue(new Error("parse"));
  await expect(ifcViewer.open(context())).rejects.toThrow("parse");
  expect(mocks.dispose).toHaveBeenCalledOnce(); expect(mocks.render).not.toHaveBeenCalled();
});
it("does not render a result arriving after cancellation", async () => {
  const ctx = context(); mocks.open.mockImplementation(async () => { ctx.controller.abort(); return {}; });
  await expect(ifcViewer.open(ctx)).rejects.toMatchObject({ name: "AbortError" });
  expect(mocks.dispose).toHaveBeenCalledOnce(); expect(mocks.render).not.toHaveBeenCalled(); expect(ctx.reportPreview).not.toHaveBeenCalled();
});
