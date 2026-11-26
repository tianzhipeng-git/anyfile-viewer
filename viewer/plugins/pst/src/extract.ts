import {
  AgentError,
  abortError,
  paginateText,
  parsePositionCursor,
  renderMarkdownTablePage,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";
import { PstArchive, type FolderInfo } from "./messaging";
import { PstError } from "./types";

const PLUGIN_ID = "outlook-pst";
const FOLDER_PAGE_ROWS = 100;

interface IndexedFolder {
  readonly folder: FolderInfo;
  readonly path: string;
}

function mapPstError(error: unknown): never {
  if (error instanceof AgentError) throw error;
  if (error instanceof DOMException && error.name === "AbortError") throw error;
  if (error instanceof PstError) {
    const code =
      error.code === "resource-limit"
        ? "resource-limit"
        : error.code === "unsupported"
          ? "encrypted-file"
          : "invalid-file";
    throw new AgentError(code, error.message, { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError(
    "invalid-file",
    error instanceof Error ? error.message : "Failed to parse PST archive.",
    { pluginId: PLUGIN_ID, cause: error },
  );
}

async function collectFolders(archive: PstArchive, signal: AbortSignal): Promise<IndexedFolder[]> {
  const out: IndexedFolder[] = [];
  const top = await archive.subfolders(archive.rootFolder.nid);
  const queue: { folder: FolderInfo; path: string; depth: number }[] = top.map((folder) => ({
    folder,
    path: folder.name || `Folder 0x${folder.nid.toString(16)}`,
    depth: 0,
  }));

  while (queue.length > 0 && out.length < 256) {
    if (signal.aborted) throw abortError();
    const item = queue.shift()!;
    out.push({ folder: item.folder, path: item.path });
    if (item.folder.hasSubfolders && item.depth < 6) {
      const children = await archive.subfolders(item.folder.nid);
      for (const child of children) {
        queue.push({
          folder: child,
          path: `${item.path}/${child.name || `0x${child.nid.toString(16)}`}`,
          depth: item.depth + 1,
        });
      }
    }
  }
  return out;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const pstExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    if (context.signal.aborted) throw abortError();
    let archive: PstArchive;
    let folders: IndexedFolder[];
    try {
      archive = await PstArchive.open(context.file, context.signal);
      folders = await collectFolders(archive, context.signal);
    } catch (error) {
      mapPstError(error);
    }

    const targets: TargetEntry[] = folders.map(({ folder, path }) => ({
      id: `folder:${folder.nid.toString(16)}`,
      title: path,
      kind: "folder",
      size: folder.contentCount,
    }));

    return {
      metadata: {
        storeName: archive.storeName,
        format: archive.ndb.header.format,
        passwordProtected: archive.passwordProtected,
        sizeBytes: context.source.size,
        folderCount: folders.length,
      },
      targets,
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    if (context.signal.aborted) throw abortError();
    let archive: PstArchive;
    try {
      archive = await PstArchive.open(context.file, context.signal);
    } catch (error) {
      mapPstError(error);
    }

    let target = params.target;
    if (!target) {
      const top = await archive.subfolders(archive.rootFolder.nid);
      const defaultPath = await archive.defaultFolderPath(top);
      const defaultNid = defaultPath[defaultPath.length - 1] ?? top[0]?.nid;
      if (defaultNid === undefined) {
        return { content: "(empty PST archive)", contentType: "markdown", truncated: false };
      }
      target = `folder:${defaultNid.toString(16)}`;
    }

    if (target.startsWith("folder:")) {
      const nidHex = target.slice(7);
      if (!/^[0-9a-f]+$/i.test(nidHex)) {
        throw new AgentError("target-not-found", `Invalid PST folder target: "${target}".`, { pluginId: PLUGIN_ID });
      }
      const nid = Number.parseInt(nidHex, 16);
      const folderNode = await archive.ndb.node(nid);
      if (!folderNode) {
        throw new AgentError("target-not-found", `PST folder not found: "${target}".`, { pluginId: PLUGIN_ID });
      }

      const list = await archive.contents(nid);
      const start = parsePositionCursor(params.cursor, "offset:", PLUGIN_ID);
      const batch = await list.page(start, FOLDER_PAGE_ROWS);
      const needle = params.filter?.trim().toLowerCase();
      const rows = batch.map((m) =>
        !needle || [m.subject, m.from, m.to].some((field) => field.toLowerCase().includes(needle))
          ? [`message:${m.nid.toString(16)}`, m.date ? m.date.toISOString() : "", m.from, m.subject || "(no subject)", m.hasAttachments ? "yes" : "no"]
          : null,
      );
      const result = renderMarkdownTablePage({
        columns: ["Target", "Date", "From", "Subject", "Attachments"],
        rows,
        start,
        maxBytes: params.maxBytes,
        cursorPrefix: "offset:",
        hasMoreAfter: () => start + batch.length < list.count,
      });
      return needle ? { ...result, filterApplied: true } : result;
    }

    if (target.startsWith("message:")) {
      const nidHex = target.slice(8);
      if (!/^[0-9a-f]+$/i.test(nidHex)) {
        throw new AgentError("target-not-found", `Invalid PST message target: "${target}".`, { pluginId: PLUGIN_ID });
      }
      const nid = Number.parseInt(nidHex, 16);
      let detail;
      try {
        detail = await archive.message(nid);
      } catch (error) {
        if (error instanceof PstError && error.code === "invalid-file") {
          throw new AgentError("target-not-found", `PST message not found: "${target}".`, { pluginId: PLUGIN_ID });
        }
        mapPstError(error);
      }

      const parts: string[] = [
        `# ${detail.subject || "(no subject)"}`,
        "",
        `- **From**: ${detail.from}${detail.fromAddress ? ` <${detail.fromAddress}>` : ""}`,
        ...(detail.displayTo ? [`- **To**: ${detail.displayTo}`] : []),
        ...(detail.displayCc ? [`- **Cc**: ${detail.displayCc}`] : []),
        ...(detail.date ? [`- **Date**: ${detail.date.toISOString()}`] : []),
        ...(detail.messageClass ? [`- **Class**: ${detail.messageClass}`] : []),
      ];

      if (detail.attachments.length > 0) {
        parts.push("", "## Attachments");
        for (const att of detail.attachments) {
          const sizeStr = att.size !== null ? `<binary ${att.size} bytes>` : "<binary>";
          parts.push(`- ${att.name || "(unnamed)"} (${att.mime || "application/octet-stream"}, ${sizeStr})`);
        }
      }

      const bodyText = detail.text.trim() || (detail.html ? stripHtmlTags(detail.html) : "");
      parts.push("", "## Body", "", bodyText || "(empty body)");

      return paginateText(parts.join("\n"), params.cursor, params.maxBytes, "markdown", PLUGIN_ID);
    }

    throw new AgentError("target-not-found", `Unknown PST target: "${target}".`, { pluginId: PLUGIN_ID });
  },
};

export default pstExtractor;
