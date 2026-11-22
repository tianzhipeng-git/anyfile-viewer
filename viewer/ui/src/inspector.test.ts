import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VIEWER_THEME_TOKEN_NAMES,
  createBadge,
  createDataTable,
  createFilterInput,
  createInspectorShell,
  createKeyValueList,
  createNotice,
  createPager,
  createSection,
  createTabBar,
  el,
  formatBytes,
  inspectorStyles,
} from "./index";
import { tableViewerStyles } from "./styles";

const roots: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) root.remove();
});

describe("dom helpers", () => {
  it("builds elements safely without interpreting HTML strings", () => {
    const node = el(
      "div",
      {
        className: "card",
        title: "Summary",
        role: "region",
        attrs: { "aria-label": "Details", disabled: false, "data-flag": true },
        dataset: { itemId: "42" },
      },
      "<script>alert(1)</script>",
      null,
      false,
      el("span", "value", 123),
    );
    expect(node.className).toBe("card");
    expect(node.title).toBe("Summary");
    expect(node.getAttribute("role")).toBe("region");
    expect(node.getAttribute("aria-label")).toBe("Details");
    expect(node.hasAttribute("disabled")).toBe(false);
    expect(node.getAttribute("data-flag")).toBe("");
    expect(node.dataset.itemId).toBe("42");
    expect(node.querySelector("script")).toBeNull();
    expect(node.textContent).toBe("<script>alert(1)</script>123");
  });

  it("formats byte sizes consistently across units and invalid values", () => {
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(-5)).toBe("—");
    expect(formatBytes(Number.NaN, "en", { empty: "N/A" })).toBe("N/A");
    expect(formatBytes(0, "en")).toBe("0 B");
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(1024, "en")).toBe("1 KiB");
    expect(formatBytes(1536, "en", { maximumFractionDigits: 1 })).toBe("1.5 KiB");
    expect(formatBytes(1024 * 1024 * 2.5, "en")).toBe("2.5 MiB");
    expect(formatBytes(1024 ** 4, "en")).toBe("1 TiB");
  });
});

describe("inspector shell and key-value list", () => {
  it("supports scroll and split layouts, dynamic header updates, and idempotent disposal", () => {
    const cleanup = vi.fn();
    const shell = createInspectorShell({
      className: "example-inspector",
      title: "model.gguf",
      subtitle: "GGUF v3",
      stats: ["48 tensors"],
      badges: [{ text: "Valid", tone: "success" }],
      layout: "split",
      extraStyles: ".example-inspector__extra { color: inherit; }",
    });
    shell.onDispose(cleanup);
    document.body.append(shell.root);
    roots.push(shell.root);

    expect(shell.root.classList.contains("anyfile-inspector")).toBe(true);
    expect(shell.root.classList.contains("example-inspector")).toBe(true);
    expect(shell.sidebar).toBeDefined();
    expect(shell.root.querySelector("style")?.textContent).toContain(".example-inspector__extra");
    expect(shell.header.textContent).toContain("model.gguf");
    expect(shell.header.textContent).toContain("48 tensors");
    expect(shell.header.textContent).toContain("Valid");

    shell.setTitle("renamed.gguf", "Updated");
    shell.setStats(["100 tensors", "2 MiB"]);
    shell.setBadges([{ text: "Expired", tone: "danger" }]);
    expect(shell.header.textContent).toContain("renamed.gguf");
    expect(shell.header.textContent).toContain("Updated");
    expect(shell.header.textContent).toContain("100 tensors");
    expect(shell.header.textContent).toContain("Expired");

    shell.dispose();
    shell.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(document.body.contains(shell.root)).toBe(false);
  });

  it("renders list and cards key-value variants while skipping hidden entries", () => {
    const list = createKeyValueList([
      { label: "Name", value: "demo" },
      { label: "Hash", value: "abc123", mono: true },
      { label: "Skipped", value: "hidden", hidden: true },
    ]);
    expect(list.classList.contains("anyfile-inspector__kv--list")).toBe(true);
    expect(list.querySelectorAll("dt")).toHaveLength(2);
    expect(list.querySelectorAll("dd")[1]?.classList.contains("anyfile-inspector__mono")).toBe(true);

    const cards = createKeyValueList(
      [{ label: "Format", value: el("strong", undefined, "ELF") }],
      { variant: "cards" },
    );
    expect(cards.classList.contains("anyfile-inspector__kv--cards")).toBe(true);
    expect(cards.querySelector(".anyfile-inspector__kv-item strong")?.textContent).toBe("ELF");
  });
});

describe("data table and controls", () => {
  it("renders rows, updates empty/note states, and handles accessible header sorting", () => {
    const onSort = vi.fn();
    const table = createDataTable({
      columns: [
        { label: "Path" },
        { label: "Size", align: "end", mono: true, sortable: true, initialSort: "desc", sortAscLabel: "Asc", sortDescLabel: "Desc" },
      ],
      rows: [["a.txt", "10 B"], { cells: ["b.txt", "20 B"], selected: true, interactive: true }],
      emptyMessage: "No rows",
      ariaLabel: "Files",
      onSort,
    });
    document.body.append(table.element);
    roots.push(table.element);

    expect(table.element.getAttribute("role")).toBe("region");
    expect(table.element.getAttribute("tabindex")).toBe("0");
    expect(table.tbody.querySelectorAll("tr")).toHaveLength(2);
    expect(table.tbody.querySelectorAll("tr")[1]?.dataset.selected).toBe("true");

    const sortTh = table.thead.querySelectorAll("th")[1]!;
    const sortBtn = sortTh.querySelector<HTMLButtonElement>("button")!;
    expect(sortTh.hasAttribute("aria-sort")).toBe(false);

    sortBtn.click();
    expect(sortTh.getAttribute("aria-sort")).toBe("descending");
    expect(onSort).toHaveBeenLastCalledWith(1, "desc");

    sortBtn.click();
    expect(sortTh.getAttribute("aria-sort")).toBe("ascending");
    expect(onSort).toHaveBeenLastCalledWith(1, "asc");

    sortBtn.click();
    expect(sortTh.hasAttribute("aria-sort")).toBe(false);
    expect(onSort).toHaveBeenLastCalledWith(1, "none");

    table.setRows([], { emptyMessage: "Empty filter" });
    expect(table.tbody.textContent).toBe("Empty filter");

    table.setRows([["c.txt", "30 B"]], { note: "Truncated" });
    expect(table.tbody.querySelectorAll("tr")).toHaveLength(2);
    expect(table.tbody.textContent).toContain("Truncated");

    table.dispose();
    sortBtn.click();
    expect(onSort).toHaveBeenCalledTimes(3);
  });

  it("wires filter, tabs, pager, section, notice, and badge cleanly", () => {
    const onInput = vi.fn();
    const filter = createFilterInput({ placeholder: "Filter", dataset: { demoFilter: "" }, onInput });
    filter.setValue("  ABC ");
    filter.input.dispatchEvent(new Event("input"));
    expect(onInput).toHaveBeenLastCalledWith("abc");
    filter.dispose();

    const onTab = vi.fn();
    const tabs = createTabBar({
      items: [{ id: "all", label: "All" }, { id: "meta", label: "Meta" }],
      onChange: onTab,
    });
    expect(tabs.buttons.get("all")?.getAttribute("aria-pressed")).toBe("true");
    tabs.buttons.get("meta")?.click();
    expect(onTab).toHaveBeenCalledWith("meta");
    expect(tabs.buttons.get("meta")?.getAttribute("aria-pressed")).toBe("true");
    tabs.dispose();

    const onPage = vi.fn();
    const pager = createPager({ previousLabel: "Prev", nextLabel: "Next", onPageChange: onPage });
    pager.update({ page: 0, pageSize: 50, total: 120 });
    expect(pager.meta.textContent).toBe("1–50 / 120");
    expect(pager.previousButton.disabled).toBe(true);
    expect(pager.nextButton.disabled).toBe(false);
    pager.nextButton.click();
    expect(onPage).toHaveBeenCalledWith(1);
    pager.dispose();

    const section = createSection("Metadata", [createNotice("Read-only", "warning"), createBadge("CA", "accent")]);
    expect(section.querySelector("h2")?.textContent).toBe("Metadata");
    expect(section.querySelector(".anyfile-inspector__notice--warning")?.textContent).toBe("Read-only");
    expect(section.querySelector(".anyfile-inspector__badge--accent")?.textContent).toBe("CA");
  });
});

describe("theme token contract", () => {
  it("keeps ViewerHost tokens in sync and avoids hardcoded light surfaces in shared CSS", () => {
    const hostSource = readFileSync(resolve(import.meta.dirname, "../../../src/components/viewer-host.tsx"), "utf8");
    for (const token of VIEWER_THEME_TOKEN_NAMES) {
      expect(hostSource).toContain(`"${token}"`);
    }
    for (const css of [inspectorStyles, tableViewerStyles]) {
      expect(css).not.toMatch(/#f1f5f9|#f8fafc|#fffbeb|#fee2e2|#64748b|#6b7280/i);
    }
  });
});
