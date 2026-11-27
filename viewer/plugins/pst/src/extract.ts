import { parseXmlDocument } from "@anyfile/runtime-assets/xml";
import {
  AgentError,
  abortError,
  isViewerAbortError,
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
const MAX_FOLDERS = 256;
const MAX_FOLDER_DEPTH = 6;
const SKIP_HTML_TAGS = new Set(["head", "style", "script", "noscript", "template"]);
const BLOCK_HTML_TAGS = new Set([
  "p", "div", "section", "article", "header", "footer", "blockquote", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "hr", "table", "ul", "ol",
]);

interface IndexedFolder {
  readonly folder: FolderInfo;
  readonly path: string;
}

function mapPstError(error: unknown): never {
  if (error instanceof AgentError) throw error;
  if (isViewerAbortError(error)) throw error;
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

async function collectFolders(
  archive: PstArchive,
  signal: AbortSignal,
): Promise<{ readonly folders: IndexedFolder[]; readonly truncated: boolean }> {
  const out: IndexedFolder[] = [];
  let truncated = false;
  const top = await archive.subfolders(archive.rootFolder.nid);
  const queue: { folder: FolderInfo; path: string; depth: number }[] = top.map((folder) => ({
    folder,
    path: folder.name || `Folder 0x${folder.nid.toString(16)}`,
    depth: 0,
  }));

  while (queue.length > 0) {
    if (out.length >= MAX_FOLDERS) {
      truncated = true;
      break;
    }
    if (signal.aborted) throw abortError();
    const item = queue.shift()!;
    out.push({ folder: item.folder, path: item.path });
    if (item.folder.hasSubfolders) {
      if (item.depth < MAX_FOLDER_DEPTH) {
        const children = await archive.subfolders(item.folder.nid);
        for (const child of children) {
          queue.push({
            folder: child,
            path: `${item.path}/${child.name || `0x${child.nid.toString(16)}`}`,
            depth: item.depth + 1,
          });
        }
      } else {
        truncated = true;
      }
    }
  }
  return { folders: out, truncated };
}

function extractHtmlText(html: string): string {
  const doc = parseXmlDocument(html, "text/html");
  const root = doc.body ?? doc.documentElement;
  if (!root) return "";
  const chunks: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      chunks.push(node.nodeValue ?? "");
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).localName.toLowerCase();
    if (SKIP_HTML_TAGS.has(tag)) return;
    if (tag === "br") {
      chunks.push("\n");
      return;
    }
    const isBlock = BLOCK_HTML_TAGS.has(tag);
    if (isBlock) chunks.push("\n");
    for (const child of Array.from(node.childNodes)) walk(child);
    if (isBlock) chunks.push("\n");
  };
  walk(root);
  return chunks
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const pstExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    if (context.signal.aborted) throw abortError();
    let archive: PstArchive;
    let collected: { readonly folders: IndexedFolder[]; readonly truncated: boolean };
    try {
      archive = await PstArchive.open(context.file, context.signal);
      collected = await collectFolders(archive, context.signal);
    } catch (error) {
      mapPstError(error);
    }

    const targets: TargetEntry[] = collected.folders.map(({ folder, path }) => ({
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
        folderCount: collected.folders.length,
      },
      targets,
      ...(collected.truncated ? { targetsTruncated: true } : {}),
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    if (context.signal.aborted) throw abortError();
    try {
      const archive = await PstArchive.open(context.file, context.signal);

      let target = params.target;
      if (!target) {
        const top = await archive.subfolders(archive.rootFolder.nid);
        const defaultPath = await archive.defaultFolderPath(top);
        const defaultNid = defaultPath[defaultPath.length - 1] ?? top[0]?.nid;
        if (defaultNid === undefined) {
          return {
            content: "(empty PST archive)",
            contentType: "markdown",
            truncated: false,
            ...(params.filter?.trim() ? { filterApplied: false } : {}),
          };
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
          throw error;
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

        const bodyText = detail.text.trim() || (detail.html ? extractHtmlText(detail.html) : "");
        parts.push("", "## Body", "", bodyText || "(empty body)");

        const result = paginateText(parts.join("\n"), params.cursor, params.maxBytes, "markdown", PLUGIN_ID);
        return params.filter?.trim() ? { ...result, filterApplied: false } : result;
      }

      throw new AgentError("target-not-found", `Unknown PST target: "${target}".`, { pluginId: PLUGIN_ID });
    } catch (error) {
      mapPstError(error);
    }
  },
};

export default pstExtractor;
