import { AgentError, type ReadResult } from "./agent";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

const byteLength = (text: string) => encoder.encode(text).byteLength;

/** Truncates `text` to at most `maxBytes` UTF-8 bytes without splitting a code point. */
export function truncateUtf8(text: string, maxBytes: number): { readonly text: string; readonly truncated: boolean } {
  const bytes = encoder.encode(text);
  if (bytes.byteLength <= maxBytes) return { text, truncated: false };
  let cut = Math.max(0, maxBytes);
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut -= 1;
  return { text: decoder.decode(bytes.subarray(0, cut)), truncated: true };
}

export function escapeMarkdownCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Uint8Array) return `<binary ${value.byteLength} bytes>`;
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

/** Parses a `<prefix><non-negative integer>` cursor; a missing cursor means position 0. */
export function parsePositionCursor(cursor: string | undefined, prefix: string, pluginId?: string): number {
  if (!cursor) return 0;
  if (!cursor.startsWith(prefix)) {
    throw new AgentError("target-not-found", `Invalid pagination cursor: "${cursor}".`, { pluginId });
  }
  const rest = cursor.slice(prefix.length);
  if (!/^\d+$/.test(rest)) {
    throw new AgentError("target-not-found", `Invalid pagination cursor: "${cursor}".`, { pluginId });
  }
  const value = Number(rest);
  if (!Number.isSafeInteger(value)) {
    throw new AgentError("target-not-found", `Invalid pagination cursor: "${cursor}".`, { pluginId });
  }
  return value;
}

/** Pages a long text by UTF-8 byte offset (`offset:<n>` cursors). */
export function paginateText(
  text: string,
  cursor: string | undefined,
  maxBytes: number,
  contentType: ReadResult["contentType"] = "markdown",
  pluginId?: string,
): ReadResult {
  const bytes = encoder.encode(text);
  const offset = parsePositionCursor(cursor, "offset:", pluginId);
  if (offset > bytes.byteLength) {
    throw new AgentError("target-not-found", `Cursor offset ${offset} is out of range.`, { pluginId });
  }
  let cut = Math.min(offset + maxBytes, bytes.byteLength);
  while (cut > offset && cut < bytes.byteLength && (bytes[cut] & 0xc0) === 0x80) cut -= 1;
  const truncated = cut < bytes.byteLength;
  return {
    content: decoder.decode(bytes.subarray(offset, cut)),
    contentType,
    truncated,
    ...(truncated && cut > offset ? { nextCursor: `offset:${cut}` } : {}),
  };
}

/** Pages whole lines by UTF-8 budget (`line:<n>` cursors); an over-long line is cut, never stalls. */
export function paginateLines(
  lines: readonly string[],
  cursor: string | undefined,
  maxBytes: number,
  pluginId?: string,
): { readonly content: string; readonly nextCursor?: string; readonly truncated: boolean } {
  const start = parsePositionCursor(cursor, "line:", pluginId);
  if (start > lines.length) {
    throw new AgentError("target-not-found", `Cursor line ${start} is out of range.`, { pluginId });
  }
  const selected: string[] = [];
  let used = 0;
  let index = start;
  let cut = false;
  while (index < lines.length) {
    const lineBytes = byteLength(lines[index]) + (selected.length > 0 ? 1 : 0);
    if (used + lineBytes > maxBytes) {
      if (selected.length === 0) {
        selected.push(truncateUtf8(lines[index], maxBytes).text);
        index += 1;
        cut = true;
      }
      break;
    }
    selected.push(lines[index]);
    used += lineBytes;
    index += 1;
  }
  const hasMore = index < lines.length;
  return {
    content: selected.join("\n"),
    truncated: hasMore || cut,
    ...(hasMore ? { nextCursor: `line:${index}` } : {}),
  };
}

export interface MarkdownTablePageOptions {
  readonly columns: readonly string[];
  /**
   * Source rows starting at `start`, in source order. Yield `null` for a row the filter rejected:
   * it still advances the cursor so pages never repeat or skip source rows.
   */
  readonly rows: Iterable<readonly unknown[] | null>;
  readonly start: number;
  readonly maxBytes: number;
  /** Cursor prefix, e.g. `"row:"`. */
  readonly cursorPrefix: string;
  /** Called after `rows` is exhausted: whether the source holds rows beyond what was yielded. */
  readonly hasMoreAfter?: () => boolean;
}

/**
 * Renders as many source rows as fit in `maxBytes` as a Markdown table. The cursor always counts
 * source rows (filtered or not); a single row wider than the budget is cut rather than stalling.
 */
export function renderMarkdownTablePage(options: MarkdownTablePageOptions): ReadResult {
  const { columns, start, maxBytes, cursorPrefix } = options;
  const header = `| ${columns.map(escapeMarkdownCell).join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |`;
  const lines = [header];
  let used = byteLength(header);
  let position = start;
  let included = 0;
  let stoppedEarly = false;

  if (used > maxBytes) {
    return { content: truncateUtf8(header, maxBytes).text, contentType: "markdown", truncated: true };
  }

  for (const row of options.rows) {
    if (row === null) {
      position += 1;
      continue;
    }
    const line = `| ${row.map(escapeMarkdownCell).join(" | ")} |`;
    const lineBytes = byteLength(line) + 1;
    if (used + lineBytes > maxBytes) {
      const room = maxBytes - used - 1;
      if (included === 0 && room > 0) {
        lines.push(truncateUtf8(line, room).text);
        position += 1;
      }
      stoppedEarly = true;
      break;
    }
    lines.push(line);
    used += lineBytes;
    included += 1;
    position += 1;
  }

  const hasMore = stoppedEarly || Boolean(options.hasMoreAfter?.());
  return {
    content: lines.join("\n"),
    contentType: "markdown",
    truncated: hasMore,
    ...(hasMore && position > start ? { nextCursor: `${cursorPrefix}${position}` } : {}),
  };
}
