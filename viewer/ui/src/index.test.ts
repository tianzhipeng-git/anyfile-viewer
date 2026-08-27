import { afterEach, describe, expect, it, vi } from "vitest";

import { createPagedTableViewer, type TableViewerPage } from "./index";

const roots: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) root.remove();
});

function page(value: string, rowOffset: number, hasMore: boolean): TableViewerPage {
  return {
    columns: [{ label: "name", type: "TEXT" }],
    rows: [[value]],
    rowOffset,
    hasMore,
    meta: `${rowOffset + 1}`,
    emptyMessage: "Empty",
  };
}

describe("paged table viewer", () => {
  it("owns shared rendering, pagination, selection, and disposal", async () => {
    const loadPage = vi.fn(async (optionId: string, pageIndex: number) =>
      page(`${optionId}-${pageIndex}`, pageIndex * 100, pageIndex === 0)
    );
    const view = await createPagedTableViewer({
      className: "example-viewer",
      fileName: "example.db",
      options: [{ id: "people", label: "People" }, { id: "orders", label: "Orders" }],
      selectorLabel: "Choose table",
      selectorDataAttribute: "table",
      previousLabel: "Previous",
      nextLabel: "Next",
      queryFailedMessage: "Query failed",
      signal: new AbortController().signal,
      loadPage,
    });
    document.body.append(view.root);
    roots.push(view.root);

    expect(view.root.classList.contains("anyfile-table-viewer")).toBe(true);
    expect(view.root.textContent).toContain("people-0");
    expect(view.root.textContent).toContain("TEXT");

    view.root.querySelector<HTMLButtonElement>("[data-next]")!.click();
    await vi.waitFor(() => expect(view.root.textContent).toContain("people-1"));
    expect(view.root.querySelector("tbody th")?.textContent).toBe("101");

    const select = view.root.querySelector<HTMLSelectElement>("[data-table]")!;
    select.value = "orders";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(view.root.textContent).toContain("orders-0"));
    expect(loadPage).toHaveBeenLastCalledWith("orders", 0);

    view.dispose();
    view.dispose();
    expect(document.body.contains(view.root)).toBe(false);
  });

  it("shows a scoped alert when a later page fails", async () => {
    const loadPage = vi.fn(async (_optionId: string, pageIndex: number) => {
      if (pageIndex > 0) throw new Error("database details");
      return page("first", 0, true);
    });
    const view = await createPagedTableViewer({
      className: "example-viewer",
      fileName: "example.db",
      options: [{ id: "people", label: "People" }],
      selectorLabel: "Choose table",
      selectorDataAttribute: "table",
      previousLabel: "Previous",
      nextLabel: "Next",
      queryFailedMessage: "Query failed",
      signal: new AbortController().signal,
      loadPage,
    });
    roots.push(view.root);

    view.root.querySelector<HTMLButtonElement>("[data-next]")!.click();
    await vi.waitFor(() => expect(view.root.querySelector("[role=alert]")?.textContent).toBe("Query failed"));
  });
});
