import {
  AgentError,
  abortError,
  isViewerAbortError,
  paginateText,
  parsePositionCursor,
  renderMarkdownTablePage,
  ViewerError,
  type ExtractContext,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";

import { readTorrent } from "./parse";
import type { TorrentDocument } from "./types";

const PLUGIN_ID = "bittorrent-metadata";

async function load(context: ExtractContext): Promise<TorrentDocument> {
  if (context.signal.aborted) throw abortError();
  try {
    return await readTorrent(context.file, context.signal, () => {});
  } catch (error) {
    if (isViewerAbortError(error)) throw error;
    const code = error instanceof ViewerError && error.code === "resource-limit" ? "resource-limit" : "invalid-file";
    throw new AgentError(code, error instanceof Error ? error.message : "Failed to parse torrent file.", {
      pluginId: PLUGIN_ID,
      cause: error,
    });
  }
}

function summary(doc: TorrentDocument) {
  return {
    name: doc.name,
    infoHash: doc.infoHash ?? null,
    totalSize: doc.totalSize,
    fileCount: doc.files.length,
    pieceLength: doc.pieceLength ?? null,
    pieceCount: doc.pieceCount ?? null,
    private: doc.isPrivate,
    createdBy: doc.createdBy ?? null,
    creationDate: doc.creationDate && !Number.isNaN(doc.creationDate.getTime()) ? doc.creationDate.toISOString() : null,
    comment: doc.comment ?? null,
    trackerCount: doc.trackers.length,
    webSeeds: [...doc.webSeeds],
  };
}

function table(columns: string[], rows: string[][], params: ReadParams): ReadResult {
  const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
  const needle = params.filter?.trim().toLowerCase();
  const result = renderMarkdownTablePage({
    columns,
    rows: rows.slice(start).map((row) => (!needle || row.some((cell) => cell.toLowerCase().includes(needle)) ? row : null)),
    start,
    maxBytes: params.maxBytes,
    cursorPrefix: "row:",
  });
  return needle ? { ...result, filterApplied: true } : result;
}

const torrentExtractor: StructuredExtractor = {
  async inspect(context) {
    const doc = await load(context);
    return {
      metadata: summary(doc),
      targets: [
        { id: "summary", title: "Summary", kind: "entry" },
        { id: "files", title: "Files", kind: "table", size: doc.files.length },
        { id: "trackers", title: "Trackers", kind: "table", size: doc.trackers.length },
      ],
    };
  },

  async read(context, params) {
    const doc = await load(context);
    const target = params.target ?? "summary";
    switch (target) {
      case "summary": {
        const result = paginateText(JSON.stringify(summary(doc), null, 2), params.cursor, params.maxBytes, "json", PLUGIN_ID);
        return params.filter?.trim() ? { ...result, filterApplied: false } : result;
      }
      case "files":
        return table(["path", "bytes"], doc.files.map((file) => [file.path, String(file.length)]), params);
      case "trackers":
        return table(["tier", "url"], doc.trackers.map((tracker) => [tracker.tier === undefined ? "" : String(tracker.tier), tracker.url]), params);
      default:
        throw new AgentError("target-not-found", `Unknown torrent target: "${target}".`, { pluginId: PLUGIN_ID });
    }
  },
};

export default torrentExtractor;
