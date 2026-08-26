import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { sqliteViewer } from "./index";
import { sqliteManifest } from "./manifest";
import { createSQLiteSession, type SQLiteSession } from "./session";

vi.mock("./session", () => ({ createSQLiteSession: vi.fn() }));

const mockedCreateSession = vi.mocked(createSQLiteSession);
const contexts: ViewerTestContext[] = [];

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
  vi.clearAllMocks();
});

describe("SQLite viewer", () => {
  it("publishes SQLite formats without DuckDB formats", () => {
    expect(() => validateManifest(sqliteManifest)).not.toThrow();
    expect(sqliteManifest.formats[0].extensions).toEqual([".sqlite", ".sqlite3", ".db"]);
  });

  it("renders tables, paginates, and disposes", async () => {
    const session: SQLiteSession = {
      tables: ["people"],
      query: vi.fn(async (_table, offset) => ({
        columns: [{ name: "name", type: "TEXT" }],
        rows: [[offset === 0 ? "Ada" : "Grace"]],
        hasMore: offset === 0,
      })),
      dispose: vi.fn(async () => undefined),
    };
    mockedCreateSession.mockResolvedValue(session);
    const context = createViewerTestContext(new File(["sqlite"], "people.sqlite"));
    contexts.push(context);
    const controller = await sqliteViewer.open(context.context);

    expect(context.container.textContent).toContain("Ada");
    context.container.querySelector<HTMLButtonElement>("[data-next]")!.click();
    await vi.waitFor(() => expect(context.container.textContent).toContain("Grace"));
    expect(session.query).toHaveBeenLastCalledWith("people", 100, 100);
    await controller.dispose();
    await controller.dispose();
    expect(session.dispose).toHaveBeenCalledOnce();
  });
});
