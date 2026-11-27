import {
  AgentError,
  abortError,
  isViewerAbortError,
  paginateLines,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";
import { PlistError, readPlist, type PlistValue } from "./parse";

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
      return Number.isNaN(value.value.getTime()) ? "Invalid Date" : value.value.toISOString();
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
  if (isViewerAbortError(error)) throw error;
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
      const seenKeys = new Set<string>();
      for (const entry of root.entries) {
        if (seenKeys.has(entry.key)) continue;
        seenKeys.add(entry.key);
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
      let key: string;
      try {
        key = decodeURIComponent(target.slice(4));
      } catch {
        throw new AgentError("target-not-found", `Malformed plist key target: "${target}".`, { pluginId: "apple-plist" });
      }
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

    const page = paginateLines(lines, params.cursor, params.maxBytes, "apple-plist");
    const isWholeJson = !page.truncated && !params.cursor && !filterApplied;

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
