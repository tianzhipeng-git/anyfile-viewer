import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { createDuckDBSession } from "./duckdb-session";
import { DATA_FILE_FORMATS, findDataFileFormat } from "./formats";
import { dataViewer } from "./index";
import { dataManifest } from "./manifest";
import type { DataPage, DataSession } from "./types";

vi.mock("./duckdb-session", () => ({ createDuckDBSession: vi.fn() }));

const mockedCreateSession = vi.mocked(createDuckDBSession);
const contexts: ViewerTestContext[] = [];

beforeEach(() => {
  vi.stubGlobal("Worker", class Worker {});
});

function testContext(name = "people.csv", locale = "zh-CN") {
  const result = createViewerTestContext(new File(["name,age\nAda,36"], name));
  contexts.push(result);
  return { ...result, context: { ...result.context, locale } };
}

function page(rows: readonly (readonly string[])[], hasMore = false): DataPage {
  return {
    columns: [{ name: "name", type: "VARCHAR" }, { name: "age", type: "BIGINT" }],
    rows,
    hasMore,
  };
}

function mockSession(
  pages: DataPage[] = [page([["Ada", "36"]])],
  dataSets: DataSession["dataSets"] = [{ id: "people", label: "people" }],
): DataSession {
  let index = 0;
  return {
    dataSets,
    query: vi.fn(async () => pages[Math.min(index++, pages.length - 1)]),
    dispose: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("DuckDB data viewer", () => {
  it("publishes all supported data formats in a valid manifest", () => {
    expect(() => validateManifest(dataManifest)).not.toThrow();
    expect(dataManifest.formats.flatMap(({ extensions }) => extensions))
      .toEqual(DATA_FILE_FORMATS.flatMap(({ extensions }) => extensions));
  });

  it.each([
    ["report.csv.gz", "csv", ".csv.gz"],
    ["REPORT.CSV.ZST", "csv", ".csv.zst"],
    ["events.ndjson.gz", "json", ".ndjson.gz"],
    ["metrics.tab.zst", "tsv", ".tab.zst"],
    ["warehouse.parq", "parquet", ".parq"],
    ["record-batches.arrow", "arrow", ".arrow"],
    ["legacy.feather", "arrow", ".feather"],
    ["analytics.ddb", "database", ".ddb"],
    ["application.sqlite3", "sqlite", ".sqlite3"],
  ])("routes %s to the %s reader", (fileName, kind, extension) => {
    expect(findDataFileFormat(fileName)).toMatchObject({ format: { kind }, extension });
  });

  it("renders typed columns, paginates, and disposes repeatedly", async () => {
    const session = mockSession([
      page([["Ada", "36"]], true),
      page([["Grace", "85"]]),
    ]);
    mockedCreateSession.mockResolvedValue(session);
    const context = testContext();
    const controller = await dataViewer.open(context.context);

    expect(context.container.textContent).toContain("Ada");
    expect(context.container.textContent).toContain("VARCHAR");
    expect(context.container.querySelector("[data-meta]")?.textContent).toBe("1–1 · 还有更多行");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    expect(context.progress.at(-1)?.stage).toBe("ready");

    context.container.querySelector<HTMLButtonElement>("[data-next]")!.click();
    await vi.waitFor(() => expect(context.container.textContent).toContain("Grace"));
    expect(session.query).toHaveBeenLastCalledWith("people", 100, 100);

    await controller.dispose();
    await controller.dispose();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(context.container.childElementCount).toBe(0);
  });

  it("switches database tables and resets pagination", async () => {
    const session = mockSession(undefined, [
      { id: "main.people", label: "people" },
      { id: "main.orders", label: "orders" },
    ]);
    mockedCreateSession.mockResolvedValue(session);
    const context = testContext("sample.duckdb");
    const controller = await dataViewer.open(context.context);
    const select = context.container.querySelector<HTMLSelectElement>("[data-dataset]")!;

    select.value = "main.orders";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(session.query).toHaveBeenLastCalledWith("main.orders", 0, 100));
    await controller.dispose();
  });

  it("uses English controls when requested", async () => {
    mockedCreateSession.mockResolvedValue(mockSession());
    const context = testContext("people.parquet", "en-US");
    const controller = await dataViewer.open(context.context);

    expect(context.container.querySelector("[data-next]")?.textContent).toBe("Next");
    expect(context.container.querySelector("[data-dataset]")?.getAttribute("aria-label"))
      .toBe("Choose table or data set");
    await controller.dispose();
  });

  it("cleans partial resources after invalid input and maps size errors", async () => {
    const invalidSession = mockSession();
    invalidSession.query = vi.fn(async () => { throw new Error("parser details"); });
    mockedCreateSession.mockResolvedValueOnce(invalidSession);
    const invalid = testContext("broken.json");
    await expect(dataViewer.open(invalid.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(invalidSession.dispose).toHaveBeenCalledOnce();
    expect(invalid.container.childElementCount).toBe(0);

    mockedCreateSession.mockRejectedValueOnce(new RangeError("too large"));
    const huge = testContext("huge.parquet");
    await expect(dataViewer.open(huge.context)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("disposes an active viewer when aborted", async () => {
    const session = mockSession();
    mockedCreateSession.mockResolvedValue(session);
    const context = testContext();
    const controller = await dataViewer.open(context.context);

    context.abortController.abort();
    await vi.waitFor(() => expect(session.dispose).toHaveBeenCalledOnce());
    expect(context.container.childElementCount).toBe(0);
    await controller.dispose();
  });
});
