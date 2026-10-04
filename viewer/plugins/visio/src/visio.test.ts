import { afterEach, describe, expect, it, vi } from "vitest";
import { visioViewer } from "./index";
import { probeVisio } from "./probe";
import { INPUT_LIMIT } from "./types";

const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
class FakeWorker {
  static instances: FakeWorker[] = [];
  static mode = "success";
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  postMessage(data: { type: string; index?: number }) {
    if (FakeWorker.mode === "pending" && data.type === "open") return;
    queueMicrotask(() => this.onmessage?.({ data: data.type === "init" ? { type: "ready" }
      : data.type === "open" ? FakeWorker.mode === "invalid" ? { type: "error", code: "invalid-file" } : { type: "opened", pages: 2 }
      : { type: "page", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1.0000in" height="0.8000in"><text>${data.index}</text></svg>` } } as MessageEvent));
  }
}
function setup() {
  FakeWorker.instances = []; FakeWorker.mode = "success";
  vi.stubGlobal("Worker", FakeWorker);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:visio-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(100);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(80);
  vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function(this: HTMLImageElement) { queueMicrotask(() => this.dispatchEvent(new Event("load"))); });
  const abort = new AbortController(), container = document.createElement("div"); document.body.append(container);
  return { abort, container, context: { file: new File([ole], "drawing.vsd"), signal: abort.signal, container, locale: "en" as const, reportProgress: vi.fn(), reportPreview: vi.fn() } };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
describe("Visio lifecycle", () => {
  it("probes bounded signatures and respects cancellation", async () => {
    const signal = new AbortController().signal;
    expect(await probeVisio({ file: new File([ole], "DRAWING.VSD"), signal })).toBe(3);
    expect(await probeVisio({ file: new File([new Uint8Array([80, 75, 3, 4])], "drawing.vsdx"), signal })).toBe(3);
    expect(await probeVisio({ file: new File(["bad"], "drawing.vsd"), signal })).toBe(0);
    const abort = new AbortController(); abort.abort();
    await expect(probeVisio({ file: new File([ole], "x.vsd"), signal: abort.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("opens two pages, navigates and disposes idempotently", async () => {
    const { context, container } = setup();
    const sibling = document.createElement("span"); container.append(sibling);
    const controller = await visioViewer.open(context);
    expect(context.reportPreview).toHaveBeenCalledWith({ outcome: "success", kind: "static" });
    expect(container.querySelectorAll("option")).toHaveLength(2);
    (container.querySelector('[aria-label="Next page"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(container.querySelector("select")?.value).toBe("1"));
    controller.dispose(); controller.dispose();
    expect(container.children).toHaveLength(1); expect(container.firstChild).toBe(sibling);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
  it("rejects corrupt and oversized input before allocating a worker", async () => {
    const { context } = setup();
    await expect(visioViewer.open({ ...context, file: new File(["bad"], "bad.vsd") })).rejects.toMatchObject({ code: "invalid-file" });
    const file = new File([ole], "large.vsd"); Object.defineProperty(file, "size", { value: INPUT_LIMIT + 1 });
    await expect(visioViewer.open({ ...context, file })).rejects.toMatchObject({ code: "resource-limit" });
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it("cleans a parser failure", async () => {
    const { context, container } = setup(); FakeWorker.mode = "invalid";
    await expect(visioViewer.open(context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(container.children).toHaveLength(0); expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  });
  it("terminates an opening parser on cancellation", async () => {
    const { context, abort, container } = setup(); FakeWorker.mode = "pending";
    const promise = visioViewer.open(context); const result = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1)); abort.abort(); await result;
    expect(container.children).toHaveLength(0); expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  });
  it("cleans an active instance and ignores further controls", async () => {
    const { context, abort, container } = setup(); const controller = await visioViewer.open(context);
    const next = container.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
    abort.abort(); next.click(); await Promise.resolve(); controller.dispose();
    expect(container.children).toHaveLength(0); expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  });
});
