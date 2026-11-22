import { selectMessages, ViewerError, type Locale, type ViewerOpenProgress } from "@anyfile/viewer-protocol";

import { BencodeError, decodeBencodeWithSpan, type BencodeValue } from "./bencode";
import type { TorrentDocument, TorrentFile, TorrentTracker } from "./types";

export const MAX_TORRENT_BYTES = 32 * 1024 * 1024;

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

function isDictionary(value: BencodeValue | undefined): value is { readonly [key: string]: BencodeValue } {
  return typeof value === "object" && value !== null && !(value instanceof Uint8Array) && !Array.isArray(value);
}

function text(value: BencodeValue | undefined): string | undefined {
  return value instanceof Uint8Array ? new TextDecoder("utf-8", { fatal: false }).decode(value) : undefined;
}

function safeText(value: BencodeValue | undefined): string | undefined {
  const decoded = text(value);
  return decoded === undefined || decoded.length === 0 ? undefined : decoded;
}

function numberValue(value: BencodeValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function trackers(info: Record<string, BencodeValue>): TorrentTracker[] {
  const result: TorrentTracker[] = [];
  const seen = new Set<string>();
  const add = (url: string | undefined, tier?: number) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    result.push({ url, tier });
  };
  add(safeText(info.announce));
  const list = info["announce-list"];
  if (Array.isArray(list)) {
    list.forEach((tier, index) => {
      if (Array.isArray(tier)) for (const item of tier) add(safeText(item), index);
    });
  }
  return result;
}

function webSeeds(info: Record<string, BencodeValue>): string[] {
  const urls: string[] = [];
  const node = info["url-list"];
  if (node instanceof Uint8Array) {
    const single = safeText(node);
    if (single) urls.push(single);
  } else if (Array.isArray(node)) {
    for (const item of node) {
      const url = safeText(item);
      if (url) urls.push(url);
    }
  }
  return urls;
}

function walkFileTree(node: Record<string, BencodeValue>, prefix: string[], out: TorrentFile[]): void {
  for (const [segment, child] of Object.entries(node)) {
    if (!isDictionary(child)) continue;
    if (segment === "") {
      const length = numberValue(child.length);
      if (length !== undefined && prefix.length > 0) {
        out.push({ path: prefix.join("/"), length: Math.max(0, length) });
      }
      continue;
    }
    walkFileTree(child, [...prefix, segment], out);
  }
}

function isV2OnlyInfo(info: Record<string, BencodeValue>): boolean {
  return numberValue(info["meta version"]) === 2
    && !Array.isArray(info.files)
    && numberValue(info.length) === undefined;
}

function files(info: Record<string, BencodeValue>): TorrentFile[] {
  const list = info.files;
  if (Array.isArray(list)) {
    return list.flatMap((entry) => {
      if (!isDictionary(entry)) return [];
      const pathParts = Array.isArray(entry.path) ? entry.path.map((part) => safeText(part) ?? "").filter(Boolean) : [];
      if (pathParts.length === 0) return [];
      return [{ path: pathParts.join("/"), length: Math.max(0, numberValue(entry.length) ?? 0) }];
    });
  }
  // Single-file v1 torrent: `length` sits at the info root and `name` is the file name.
  const length = numberValue(info.length);
  const name = safeText(info.name);
  if (length !== undefined && name) return [{ path: name, length: Math.max(0, length) }];
  // BEP 52 v2 torrent: files are stored in nested `file tree` dictionaries.
  const fileTree = info["file tree"];
  if (isDictionary(fileTree)) {
    const result: TorrentFile[] = [];
    walkFileTree(fileTree, [], result);
    return result;
  }
  return [];
}

async function digestHex(bytes: Uint8Array, algorithm: "SHA-1" | "SHA-256"): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || bytes.length === 0) return undefined;
  try {
    const digest = await subtle.digest(algorithm, bytes.slice().buffer as ArrayBuffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

function toDocument(root: BencodeValue, infoHash?: string): TorrentDocument {
  if (!isDictionary(root)) throw new Error("Torrent root is not a dictionary");
  const info = root.info;
  if (!isDictionary(info)) throw new Error("Torrent has no info dictionary");
  const name = safeText(info.name);
  if (!name) throw new Error("Torrent info has no name");
  if (isV2OnlyInfo(info) && !isDictionary(info["file tree"])) {
    throw new Error("BitTorrent v2 info dictionary is missing file tree");
  }

  const fileList = files(info);
  const totalSize = fileList.reduce((sum, file) => sum + file.length, 0);
  const pieceLength = numberValue(info["piece length"]);
  const pieces = info.pieces;
  const pieceCount = pieces instanceof Uint8Array ? Math.floor(pieces.length / 20) : undefined;
  const creationSeconds = numberValue(root["creation date"]);

  return {
    name,
    comment: safeText(root.comment),
    createdBy: safeText(root["created by"]),
    creationDate: creationSeconds !== undefined ? new Date(creationSeconds * 1000) : undefined,
    announce: safeText(root.announce),
    trackers: trackers(root),
    webSeeds: webSeeds(root),
    pieceLength,
    pieceCount,
    isPrivate: numberValue(info.private) === 1,
    files: fileList,
    totalSize,
    infoHash,
  };
}

export async function readTorrent(
  file: File,
  signal: AbortSignal,
  reportProgress: (progress: ViewerOpenProgress) => void,
  locale: Locale = "en",
): Promise<TorrentDocument> {
  const copy = selectMessages(locale, {
    en: {
      limit: "This torrent file exceeds the 32 MiB browser limit.",
      invalid: "The file is damaged or is not a valid torrent file.",
    },
    "zh-CN": {
      limit: "种子文件超过 32 MiB，无法在浏览器中安全解析。",
      invalid: "文件已损坏，或不是有效的种子文件。",
    },
  });
  if (file.size > MAX_TORRENT_BYTES) {
    throw new ViewerError("resource-limit", copy.limit, { cause: file.size });
  }
  if (signal.aborted) throw abortError();

  const reader = file.slice(0, file.size).stream().getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      loaded += result.value.byteLength;
      reportProgress({ stage: "reading", loaded, total: file.size });
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  if (signal.aborted) throw abortError();

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let decoded: { value: BencodeValue; span?: { start: number; end: number } };
  try {
    decoded = decodeBencodeWithSpan(bytes, "info");
  } catch (error) {
    if (error instanceof BencodeError) throw new ViewerError("invalid-file", copy.invalid, { cause: error });
    throw error;
  }

  const infoBytes = decoded.span ? bytes.subarray(decoded.span.start, decoded.span.end) : undefined;
  const infoNode = isDictionary(decoded.value) && isDictionary(decoded.value.info) ? decoded.value.info : undefined;
  const hashAlgorithm = infoNode && isV2OnlyInfo(infoNode) ? "SHA-256" : "SHA-1";
  const infoHash = infoBytes ? await digestHex(infoBytes, hashAlgorithm) : undefined;
  if (signal.aborted) throw abortError();

  try {
    return toDocument(decoded.value, infoHash);
  } catch (error) {
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}
