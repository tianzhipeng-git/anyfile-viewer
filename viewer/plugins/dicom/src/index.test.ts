import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dicomFixture } from "./fixtures";
import { inspectDicom } from "./decoder";

const state = vi.hoisted(() => ({ open: vi.fn(), frame: vi.fn(), dispose: vi.fn(), pixels: vi.fn(), viewportDispose: vi.fn() }));
vi.mock("./worker-client", () => ({ DicomWorker: class { open = state.open; frame = state.frame; dispose = state.dispose; } }));
vi.mock("./viewport", () => ({ DicomViewport: class { setPixels = state.pixels; dispose = state.viewportDispose; } }));
import { dicomViewer } from "./index";

const bytes = dicomFixture({ frames: 2, pixels: [0, 100, 200, 300, 300, 200, 100, 0] });
const info = inspectDicom(bytes, bytes.length).info;
function context() {
  const abort = new AbortController();
  const container = document.createElement("div");
  document.body.append(container);
  return { abort, container, signal: abort.signal, file: new File([bytes], "test.dcm"), locale: "en" as const, reportProgress: vi.fn(), reportPreview: vi.fn() };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  vi.stubGlobal("Worker", class {});
  state.open.mockResolvedValue({ ...info });
  state.frame.mockResolvedValue({ rgba: new Uint8ClampedArray(16), window: { center: 150, width: 301 } });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe("DICOM lifecycle", () => {
  it("opens the first frame, changes frames and releases resources once", async () => {
    const ctx = context();
    const controller = await dicomViewer.open(ctx);
    expect(state.frame).toHaveBeenCalledWith(0, undefined);
    expect(ctx.reportPreview).toHaveBeenCalledWith({ outcome: "success", kind: "static" });
    const input = ctx.container.querySelector("input")!;
    input.value = "2"; input.dispatchEvent(new Event("change"));
    await tick();
    expect(state.frame).toHaveBeenLastCalledWith(1, undefined);
    expect(ctx.container.textContent).toContain("Displayed frame: 2 / 2");
    const progress = ctx.reportProgress.mock.calls.length;
    ctx.abort.abort(); await controller.dispose(); await controller.dispose();
    expect(state.dispose).toHaveBeenCalledTimes(1);
    expect(state.viewportDispose).toHaveBeenCalledTimes(1);
    expect(ctx.container.children).toHaveLength(0);
    input.dispatchEvent(new Event("change"));
    expect(state.frame).toHaveBeenCalledTimes(2);
    expect(ctx.reportProgress).toHaveBeenCalledTimes(progress);
  });
  it("shows localized metadata-only limitations without creating an image", async () => {
    state.open.mockResolvedValue({ ...info, reason: "syntax" });
    const ctx = context();
    const controller = await dicomViewer.open({ ...ctx, locale: "zh-CN" });
    expect(ctx.container.textContent).toContain("仅显示元数据");
    expect(state.frame).not.toHaveBeenCalled();
    expect(ctx.reportPreview).toHaveBeenCalledWith({ outcome: "success", kind: "structure" });
    await controller.dispose();
  });
  it("cleans up initialization failure and returns a stable localized error", async () => {
    state.frame.mockRejectedValueOnce(new Error("sensitive parser details"));
    const ctx = context();
    await expect(dicomViewer.open(ctx)).rejects.toMatchObject({ code: "invalid-file", message: "The DICOM file is invalid or truncated." });
    expect(ctx.container.children).toHaveLength(0);
    expect(state.dispose).toHaveBeenCalledOnce();
    expect(state.viewportDispose).toHaveBeenCalledOnce();
    expect(ctx.reportPreview).not.toHaveBeenCalled();
  });
  it("does not mount stale results after opening is canceled", async () => {
    let resolve!: (value: typeof info) => void;
    state.open.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const ctx = context();
    const opening = dicomViewer.open(ctx);
    ctx.abort.abort(); resolve(info);
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(ctx.container.children).toHaveLength(0);
    expect(state.frame).not.toHaveBeenCalled();
  });
  it("does not paint or update DOM after active cancellation", async () => {
    const ctx = context();
    const controller = await dicomViewer.open(ctx);
    let resolve!: (value: unknown) => void;
    state.frame.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const input = ctx.container.querySelector("input")!;
    input.value = "2"; input.dispatchEvent(new Event("change"));
    ctx.abort.abort();
    resolve({ rgba: new Uint8ClampedArray(16), window: { center: 0, width: 1 } });
    await tick();
    expect(state.pixels).toHaveBeenCalledTimes(1);
    expect(ctx.container.children).toHaveLength(0);
    await controller.dispose();
  });
  it("keeps the previous frame on a local frame failure", async () => {
    const ctx = context();
    const controller = await dicomViewer.open(ctx);
    state.frame.mockRejectedValueOnce(new Error("bad frame"));
    const input = ctx.container.querySelector("input")!;
    input.value = "2"; input.dispatchEvent(new Event("change"));
    await tick();
    expect(input.value).toBe("1");
    expect(input.disabled).toBe(false);
    expect(ctx.container.textContent).toContain("previous image remains displayed");
    expect(state.pixels).toHaveBeenCalledTimes(1);
    await controller.dispose();
  });
});
