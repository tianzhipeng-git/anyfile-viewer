import {
  AgentError,
  abortError,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";
import { PlistError, readPlist, type PlistValue } from "./parse";

const encoder = new TextEncoder();

function toJsonValue(value: PlistValue): JsonValue {
  switch (value.kind) {
    case "null":
      return null;
    case "boolean":
    case "string":
      return value.value;
    case "real":
      return Number.isFinite(value.value) ? value.value : String(value.value);
    case "integer": {
      const n = Number(value.value);
      return Number.isSafeInteger(n) ? n : value.value.toString();
    }
    case "uid":
      return `CF$UID(${value.value.toString()})`;
    case "date":
      return value.value.toISOString();
    case "data":
      return `<binary ${value.value.byteLength} bytes>`;
    case "array":
      return value.items.map(toJsonValue);
    case "dict": {
      const out: Record<string, JsonValue> = {};
      for (const entry of value.entries) {
        out[entry.key] = toJsonValue(entry.value);
      }
      return out;
    }
  }
}

function mapError(error: unknown): never {
  if (error instanceof AgentError) throw error;
  if (error instanceof DOMException && error.name === "AbortError") throw error;
  if (error instanceof PlistError) {
    throw new AgentError(error.code === "resource-limit" ? "resource-limit" : "invalid-file", error.message, {
      pluginId: "apple-plist",
      cause: error,
    });
  }
  throw new AgentError(
    "invalid-file",
    error instanceof Error ? error.message : "Failed to parse property list.",
    { pluginId: "apple-plist", cause: error },
  );
}

function parseCursor(cursor?: string): number {
  if (!cursor) return 0;
  const match = /^line:(\d+)$/.exec(cursor);
  if (!match) {
    throw new AgentError("target-not-found", `Invalid pagination cursor: "${cursor}".`, { pluginId: "apple-plist" });
  }
  return Number(match[1]);
}

function paginateLines(lines: readonly string[], startLine: number, maxBytes: number): {
  readonly content: string;
  readonly nextCursor?: string;
  readonly truncated: boolean;
} {
  if (startLine < 0 || startLine > lines.length) {
    throw new AgentError("target-not-found", `Cursor line offset ${startLine} out of range.`, { pluginId: "apple-plist" });
  }
  const selected: string[] = [];
  let usedBytes = 0;
  let idx = startLine;

  while (idx < lines.length) {
    const line = lines[idx];
    const lineBytes = encoder.encode(selected.length === 0 ? line : `\n${line}`).byteLength;
    if (selected.length > 0 && usedBytes + lineBytes > maxBytes) break;
    if (selected.length === 0 && lineBytes > maxBytes) {
      // Single line exceeds maxBytes: slice UTF-8 safely
      const encoded = encoder.encode(line);
      let cut = maxBytes;
      while (cut > 0 && (encoded[cut] & 0xc0) === 0x80) cut -= 1;
      selected.push(new TextDecoder("utf-8").decode(encoded.subarray(0, cut)));
      idx += 1;
      return {
        content: selected.join("\n"),
        ...(idx < lines.length ? { nextCursor: `line:${idx}` } : {}),
        truncated: true,
      };
    }
    selected.push(line);
    usedBytes += lineBytes;
    idx += 1;
  }

  const hasMore = idx < lines.length;
  return {
    content: selected.join("\n"),
    ...(hasMore ? { nextCursor: `line:${idx}` } : {}),
    truncated: hasMore,
  };
}

const plistExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    if (context.signal.aborted) throw abortError();
    let root: PlistValue;
    try {
      root = await readPlist(context.file, context.signal);
    } catch (error) {
      mapError(error);
    }

    const targets: TargetEntry[] = [
      {
        id: "root",
        title: "Root",
        kind: "entry",
        size:
          root.kind === "dict"
            ? root.entries.length
            : root.kind === "array"
              ? root.items.length
              : 1,
      },
    ];

    if (root.kind === "dict") {
      for (const entry of root.entries) {
        targets.push({
          id: `key:${encodeURIComponent(entry.key)}`,
          title: entry.key,
          kind: entry.value.kind,
          ...(entry.value.kind === "dict"
            ? { size: entry.value.entries.length }
            : entry.value.kind === "array"
              ? { size: entry.value.items.length }
              : entry.value.kind === "data"
                ? { size: entry.value.value.byteLength }
                : {}),
        });
      }
    }

    return {
      metadata: {
        rootKind: root.kind,
        sizeBytes: context.source.size,
        topLevelEntries:
          root.kind === "dict" ? root.entries.length : root.kind === "array" ? root.items.length : 1,
      },
      targets,
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    if (context.signal.aborted) throw abortError();
    let root: PlistValue;
    try {
      root = await readPlist(context.file, context.signal);
    } catch (error) {
      mapError(error);
    }

    const target = params.target ?? "root";
    let selectedValue: PlistValue | undefined;
    if (target === "root") {
      selectedValue = root;
    } else if (target.startsWith("key:") && root.kind === "dict") {
      const key = decodeURIComponent(target.slice(4));
      selectedValue = root.entries.find((entry) => entry.key === key)?.value;
    }

    if (!selectedValue) {
      throw new AgentError("target-not-found", `Plist target not found: "${target}".`, { pluginId: "apple-plist" });
    }

    const jsonText = JSON.stringify(toJsonValue(selectedValue), null, 2);
    let lines = jsonText.split("\n");
    let filterApplied: boolean | undefined;
    if (params.filter && params.filter.trim().length > 0) {
      const needle = params.filter.toLowerCase();
      lines = lines.filter((line) => line.toLowerCase().includes(needle));
      filterApplied = true;
    }

    const startLine = parseCursor(params.cursor);
    const page = paginateLines(lines, startLine, params.maxBytes);
    const isWholeJson = !page.truncated && startLine === 0 && !filterApplied;

    return {
      content: page.content,
      contentType: isWholeJson ? "json" : "text",
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      truncated: page.truncated,
      ...(filterApplied !== undefined ? { filterApplied } : {}),
    };
  },
};

export default plistExtractor;
