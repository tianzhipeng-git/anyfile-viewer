import { createViewerTestContext } from "@anyfile/viewer-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { statDataViewer } from "./index";
import type { Request, StatSchema } from "./types";
import { StatWorkerClient } from "./worker-client";

const schema: StatSchema = {
  meta: { rows: 120, variables: 2, created: 0, modified: 0, version: 2, compression: 1, table: "", label: "Survey", encoding: "UTF-8" },
  variables: [
    { name: "sex", label: "Sex", format: "F1.0", labels: "sex", string: false, storage: 8, display: 8, measure: 1, missing: [[9, 9]] },
    { name: "visit", label: "Visit date", format: "ADATE10", labels: "", string: false, storage: 8, display: 10, measure: 3, missing: [] },
  ],
  labels: [{ name: "sex", values: [[1, "Male"], [2, "Female"]] }],
  notes: [],
};
class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  static mode: "success" | "invalid" | "pending" = "success";
  readonly requests: Request[] = [];
  terminate = vi.fn();
  constructor() { super(); FakeWorker.instances.push(this); }
  postMessage(request: Request) {
    this.requests.push(request);
    if (FakeWorker.mode === "pending" && request.type === "open") return;
    const data = request.type === "init" ? { id: request.id, type: "ready" }
      : request.type === "open" ? FakeWorker.mode === "invalid" ? { id: request.id, type: "error", code: "invalid-file", message: "bad" } : { id: request.id, type: "schema", schema }
      : { id: request.id, type: "rows", rows: Array.from({ length: Math.min(request.limit, 120 - request.offset) }, (_, index) => [index % 2 + 1, 13_630_723_200]) };
    queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data })));
  }
}
const sav = () => new File([new TextEncoder().encode("$FL2@(#) IBM SPSS STATISTICS")], "survey.sav");
function setup(file = sav()) {
  FakeWorker.instances = []; FakeWorker.mode = "success";
  vi.stubGlobal("Worker", FakeWorker);
  const test = createViewerTestContext(file);
  return { ...test, context: { ...test.context, reportPreview: vi.fn() } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe("statistical data viewer lifecycle", () => {
  it("opens paged data with labels and dates, switches views and disposes once", async () => {
    const { context, container, outside } = setup();
    const controller = await statDataViewer.open(context);
    expect(context.reportPreview).toHaveBeenCalledWith({ outcome: "success", kind: "structure" });
    const cells = () => [...container.querySelectorAll("tbody tr:first-child td")].map((cell) => cell.textContent);
    expect(cells()).toEqual(["Male (1)", "2014-09-22"]);
    expect(container.querySelector("[data-meta]")?.textContent).toBe("第 1–100 行，共 120 行");
    expect(FakeWorker.instances[0].requests.at(-1)).toMatchObject({ type: "rows", offset: 0, limit: 100, firstColumn: 0, lastColumn: 2 });
    (container.querySelector("[data-next]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(container.querySelectorAll("tbody tr")).toHaveLength(20));
    const select = container.querySelector("select")!;
    expect([...select.options].map((option) => option.value)).toEqual(["data:0", "variables", "labels", "info"]);
    select.value = "variables"; select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(cells()).toEqual(["sex", "Sex", "数值 (8)", "F1.0", "sex", "9", "名义"]));
    controller.dispose(); controller.dispose();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(container.childElementCount).toBe(0);
    expect(outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("rejects invalid files without leaving DOM or a live worker", async () => {
    const { context, container } = setup(new File(["not data"], "fake.sav"));
    await expect(statDataViewer.open(context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(FakeWorker.instances).toHaveLength(0);
    const parsed = setup();
    FakeWorker.mode = "invalid";
    await expect(statDataViewer.open(parsed.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(container.childElementCount + parsed.container.childElementCount).toBe(0);
  });

  it("aborts while parsing and terminates the worker", async () => {
    const { context, container, abortController } = setup();
    FakeWorker.mode = "pending";
    const opening = statDataViewer.open(context);
    await vi.waitFor(() => expect(FakeWorker.instances[0]?.requests.some(({ type }) => type === "open")).toBe(true));
    abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(container.childElementCount).toBe(0);
  });

  it("terminates an over-budget parse", async () => {
    vi.useFakeTimers(); setup(); FakeWorker.mode = "pending";
    const client = new StatWorkerClient(new AbortController().signal);
    const result = expect(client.open(sav(), "sav")).rejects.toMatchObject({ code: "resource-limit" });
    await vi.advanceTimersByTimeAsync(120_000); await result;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  });
});
