import {
  AgentError,
  abortError,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";
import { PstArchive, type FolderInfo } from "./messaging";
import { PstError } from "./types";

const encoder = new TextEncoder();

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
    throw new AgentError(code, error.message, { pluginId: "outlook-pst", cause: error });
  }
  throw new AgentError(
    "invalid-file",
    error instanceof Error ? error.message : "Failed to parse PST archive.",
    { pluginId: "outlook-pst", cause: error },
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

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\r\n", " ").replaceAll("\n", " ");
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

function parseOffsetCursor(cursor?: string): number {
  if (!cursor) return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  if (!match) {
    throw new AgentError("target-not-found", `Invalid pagination cursor: "${cursor}".`, { pluginId: "outlook-pst" });
  }
  return Number(match[1]);
}

function paginateText(text: string, offset: number, maxBytes: number): ReadResult {
  const bytes = encoder.encode(text);
  if (offset < 0 || offset > bytes.byteLength) {
    throw new AgentError("target-not-found", `Cursor offset ${offset} out of range.`, { pluginId: "outlook-pst" });
  }
  const end = Math.min(offset + maxBytes, bytes.byteLength);
  let cut = end;
  if (cut < bytes.byteLength) {
    while (cut > offset && (bytes[cut] & 0xc0) === 0x80) cut -= 1;
  }
  const content = new TextDecoder("utf-8").decode(bytes.subarray(offset, cut));
  const truncated = cut < bytes.byteLength;
  return {
    content,
    contentType: "markdown",
    ...(truncated && cut > offset ? { nextCursor: `offset:${cut}` } : {}),
    truncated,
  };
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
        throw new AgentError("target-not-found", `Invalid PST folder target: "${target}".`, { pluginId: "outlook-pst" });
      }
      const nid = Number.parseInt(nidHex, 16);
      const folderNode = await archive.ndb.node(nid);
      if (!folderNode) {
        throw new AgentError("target-not-found", `PST folder not found: "${target}".`, { pluginId: "outlook-pst" });
      }

      const list = await archive.contents(nid);
      const startRow = parseOffsetCursor(params.cursor);
      const batch = await list.page(startRow, 100);
      let messages = batch;
      let filterApplied: boolean | undefined;
      if (params.filter && params.filter.trim().length > 0) {
        const needle = params.filter.toLowerCase();
        messages = messages.filter(
          (m) =>
            m.subject.toLowerCase().includes(needle) ||
            m.from.toLowerCase().includes(needle) ||
            m.to.toLowerCase().includes(needle),
        );
        filterApplied = true;
      }

      const header = "| Target | Date | From | Subject | Attachments |\n| --- | --- | --- | --- | --- |";
      const headerBytes = encoder.encode(header).byteLength;
      if (headerBytes > params.maxBytes) {
        return paginateText(header, 0, params.maxBytes);
      }

      const lines = [header];
      let usedBytes = headerBytes;
      let included = 0;
      for (const msg of messages) {
        const row = `| message:${msg.nid.toString(16)} | ${msg.date ? msg.date.toISOString() : ""} | ${escapeCell(msg.from)} | ${escapeCell(msg.subject || "(no subject)")} | ${msg.hasAttachments ? "yes" : "no"} |`;
        const rowBytes = encoder.encode(`\n${row}`).byteLength;
        if (usedBytes + rowBytes > params.maxBytes) break;
        lines.push(row);
        usedBytes += rowBytes;
        included += 1;
      }

      const nextRow = startRow + included;
      const hasMore = included < messages.length || startRow + batch.length < list.count;
      return {
        content: lines.join("\n"),
        contentType: "markdown",
        ...(hasMore && included > 0 ? { nextCursor: `offset:${nextRow}` } : {}),
        truncated: hasMore,
        ...(filterApplied !== undefined ? { filterApplied } : {}),
      };
    }

    if (target.startsWith("message:")) {
      const nidHex = target.slice(8);
      if (!/^[0-9a-f]+$/i.test(nidHex)) {
        throw new AgentError("target-not-found", `Invalid PST message target: "${target}".`, { pluginId: "outlook-pst" });
      }
      const nid = Number.parseInt(nidHex, 16);
      let detail;
      try {
        detail = await archive.message(nid);
      } catch (error) {
        if (error instanceof PstError && error.code === "invalid-file") {
          throw new AgentError("target-not-found", `PST message not found: "${target}".`, { pluginId: "outlook-pst" });
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

      const full = parts.join("\n");
      const offset = parseOffsetCursor(params.cursor);
      return paginateText(full, offset, params.maxBytes);
    }

    throw new AgentError("target-not-found", `Unknown PST target: "${target}".`, { pluginId: "outlook-pst" });
  },
};

export default pstExtractor;
