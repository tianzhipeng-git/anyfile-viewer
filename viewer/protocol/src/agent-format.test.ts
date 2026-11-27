import { describe, expect, it } from "vitest";
import { paginateLines, paginateText, parsePositionCursor, renderMarkdownTablePage } from "./agent-format";

const ids = (content: string) => content.split("\n").slice(2).map((line) => Number(line.split("|")[1]));

function walkTable(source: readonly number[], keep: (id: number) => boolean, maxBytes: number) {
  const seen: number[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const start = cursor ? Number(cursor.slice(4)) : 0;
    const result = renderMarkdownTablePage({
      columns: ["id"],
      rows: source.slice(start).map((id) => (keep(id) ? [id] : null)),
      start,
      maxBytes,
      cursorPrefix: "row:",
    });
    seen.push(...ids(result.content));
    if (!result.nextCursor) return seen;
    cursor = result.nextCursor;
  }
  throw new Error("pagination did not terminate");
}

describe("agent pagination helpers", () => {
  it("advances table cursors over source rows so filtered pages never repeat or skip", () => {
    const source = Array.from({ length: 500 }, (_, index) => index);
    const hits = source.filter((id) => id % 10 === 0);
    expect(walkTable(source, (id) => id % 10 === 0, 80)).toEqual(hits);
    expect(walkTable(source, () => true, 64)).toEqual(source);
  });

  it("advances past a filtered page with no matches and cuts a row wider than the budget", () => {
    const empty = renderMarkdownTablePage({
      columns: ["id"], rows: [null, null], start: 4, maxBytes: 100, cursorPrefix: "row:", hasMoreAfter: () => true,
    });
    expect(empty).toMatchObject({ truncated: true, nextCursor: "row:6" });
    const wide = renderMarkdownTablePage({
      columns: ["v"], rows: [["x".repeat(500)], ["y"]], start: 0, maxBytes: 40, cursorPrefix: "row:",
    });
    expect(new TextEncoder().encode(wide.content).byteLength).toBeLessThanOrEqual(40);
    expect(wide.nextCursor).toBe("row:1");
  });

  it("pages text and lines without splitting UTF-8 code points", () => {
    const text = "数据".repeat(50);
    let cursor: string | undefined;
    let rebuilt = "";
    do {
      const page = paginateText(text, cursor, 31);
      rebuilt += page.content;
      cursor = page.nextCursor;
    } while (cursor);
    expect(rebuilt).toBe(text);

    const lines = paginateLines(["a", "b", "c"], "line:1", 3);
    expect(lines).toEqual({ content: "b\nc", truncated: false });
    expect(() => paginateLines(["a"], "bogus", 10)).toThrow(/Invalid pagination cursor/);
    expect(parsePositionCursor("row.+42", "row.+")).toBe(42);
    expect(() => parsePositionCursor("rowX42", "row.")).toThrow(/Invalid pagination cursor/);
    expect(() => parsePositionCursor("line:99999999999999999999", "line:")).toThrow(/Invalid pagination cursor/);
  });
});
