import { parseHtmlText } from "@anyfile/rendering-publication/text";
import { decodeChmText, encodingFromLcid } from "./encoding";
import type { ChmDirectory, ChmEntry } from "./itsf";
import { CHM_LIMITS } from "./limits";
import type { ChmSectionReader } from "./section-reader";

export interface ChmTocNode {
  readonly label: string;
  readonly path: string;
  readonly fragment: string;
  readonly children: readonly ChmTocNode[];
}

export interface ChmIndexEntry {
  readonly label: string;
  readonly path: string;
  readonly fragment: string;
}

export interface ChmMetadata {
  readonly title: string;
  readonly compiledName: string;
  readonly encoding: string;
  readonly defaultTopic: string;
  readonly hhcPath: string;
  readonly hhkPath: string;
  readonly tocTree: readonly ChmTocNode[];
  readonly indexEntries: readonly ChmIndexEntry[];
  readonly systemTopics: readonly { title: string; url: string }[];
}

export function normalizeChmPath(rawPath: string): string {
  let clean = rawPath.trim().replace(/\\/g, "/");
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // Keep raw characters if percent-encoding is malformed.
  }
  clean = clean.replace(/^\/+/, "");
  const parts: string[] = [];
  for (const seg of clean.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > 0) parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return "/" + parts.join("/");
}

export function resolveChmEntry(
  directory: ChmDirectory,
  basePath: string,
  reference: string,
  selfChmNames?: ReadonlySet<string>,
): { entry: ChmEntry; fragment: string } | null {
  const trimmed = reference.trim();
  if (!trimmed || /^(?:javascript|vbscript|data|mailto|tel|https?|ftp):/i.test(trimmed)) {
    return null;
  }

  let localRef = trimmed;
  const msItsMatch = /^(?:ms-its|its|mk:@MSITStore):([^:]*)::(.*)$/i.exec(localRef);
  if (msItsMatch) {
    const chmName = msItsMatch[1].trim().replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
    if (chmName && (!selfChmNames || !selfChmNames.has(chmName))) {
      return null;
    }
    const targetPath = msItsMatch[2].trim();
    if (!targetPath.startsWith("/")) return null;
    localRef = targetPath;
  } else if (/^[a-z][\w+.-]*:/i.test(localRef)) {
    return null;
  }

  const [rawTarget, rawFragment = ""] = localRef.split("#", 2);
  let fragment = rawFragment;
  try {
    fragment = decodeURIComponent(rawFragment);
  } catch {
    // Preserve raw fragment if malformed.
  }

  if (!rawTarget) {
    const exact = directory.byExactPath.get(basePath) ?? directory.byLowerPath.get(basePath.toLowerCase());
    return exact ? { entry: exact, fragment } : null;
  }

  const candidates: string[] = [];
  if (rawTarget.startsWith("/")) {
    candidates.push(normalizeChmPath(rawTarget));
  } else {
    const baseDir = basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/") + 1) : "/";
    candidates.push(normalizeChmPath(baseDir + rawTarget));
    candidates.push(normalizeChmPath("/" + rawTarget));
  }

  for (const candidate of candidates) {
    const exact = directory.byExactPath.get(candidate) ?? directory.byLowerPath.get(candidate.toLowerCase());
    if (exact) return { entry: exact, fragment };
  }
  return null;
}

function readNullTerminated(bytes: Uint8Array, encoding: string): string {
  let end = bytes.indexOf(0);
  if (end < 0) end = bytes.length;
  return decodeChmText(bytes.subarray(0, end), encoding).trim();
}

function parseSystemFile(
  bytes: Uint8Array,
  fallbackEncoding: string,
): {
  title: string;
  compiledName: string;
  defaultTopic: string;
  hhcPath: string;
  hhkPath: string;
  encoding: string;
} {
  let encoding = fallbackEncoding;
  let title = "";
  let compiledName = "";
  let defaultTopic = "";
  let hhcPath = "";
  let hhkPath = "";

  if (bytes.byteLength < 4) {
    return { title, compiledName, defaultTopic, hhcPath, hhkPath, encoding };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: { code: number; payload: Uint8Array }[] = [];
  let pos = 4;
  while (pos + 4 <= bytes.byteLength) {
    const code = view.getUint16(pos, true);
    const len = view.getUint16(pos + 2, true);
    pos += 4;
    if (pos + len > bytes.byteLength) break;
    const payload = bytes.subarray(pos, pos + len);
    pos += len;
    if (code === 4 && payload.byteLength >= 4) {
      const lcid = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, true);
      if (lcid > 0) encoding = encodingFromLcid(lcid);
    }
    records.push({ code, payload });
  }

  for (const { code, payload } of records) {
    if (code === 0 && !hhcPath) hhcPath = readNullTerminated(payload, encoding);
    else if (code === 1 && !hhkPath) hhkPath = readNullTerminated(payload, encoding);
    else if (code === 2 && !defaultTopic) defaultTopic = readNullTerminated(payload, encoding);
    else if (code === 3 && !title) title = readNullTerminated(payload, encoding);
    else if (code === 6 && !compiledName) compiledName = readNullTerminated(payload, encoding);
  }

  return { title, compiledName, defaultTopic, hhcPath, hhkPath, encoding };
}

function readStringsAt(stringsBytes: Uint8Array, offset: number, encoding: string): string {
  if (offset <= 0 || offset >= stringsBytes.byteLength) return "";
  let end = offset;
  while (end < stringsBytes.byteLength && stringsBytes[end] !== 0) end += 1;
  return decodeChmText(stringsBytes.subarray(offset, end), encoding).trim();
}

function readUrlStrAt(urlStrBytes: Uint8Array, offset: number, encoding: string): string {
  if (offset < 0 || offset + 8 >= urlStrBytes.byteLength) return "";
  let pos = offset + 8;
  while (pos < urlStrBytes.byteLength && urlStrBytes[pos] !== 0) pos += 1;
  return decodeChmText(urlStrBytes.subarray(offset + 8, pos), encoding).trim();
}

function parseSitemapHtml(
  htmlText: string,
  directory: ChmDirectory,
  sitemapPath: string,
): { tree: ChmTocNode[]; flatCount: number } {
  const doc = parseHtmlText(htmlText);
  let flatCount = 0;

  function extractObject(li: Element): { label: string; path: string; fragment: string } | null {
    const obj = Array.from(li.children).find((el) => el.localName === "object");
    if (!obj) return null;
    const type = (obj.getAttribute("type") ?? "").toLowerCase();
    if (type !== "text/sitemap") return null;

    let label = "";
    let local = "";
    for (const param of Array.from(obj.querySelectorAll("param"))) {
      const name = (param.getAttribute("name") ?? "").toLowerCase();
      const value = (param.getAttribute("value") ?? "").trim();
      if (name === "name" && !label) label = value;
      else if ((name === "local" || name === "url") && !local) local = value;
    }

    if (!label && !local) return null;
    if (!local) return { label: label || "Section", path: "", fragment: "" };
    const resolved = resolveChmEntry(directory, sitemapPath, local);
    if (!resolved) return { label: label || local, path: "", fragment: "" };
    return {
      label: label || resolved.entry.path.split("/").pop() || resolved.entry.path,
      path: resolved.entry.path,
      fragment: resolved.fragment,
    };
  }

  function walkList(ul: Element, depth: number): ChmTocNode[] {
    if (depth > 32 || flatCount >= CHM_LIMITS.maxTocItems) return [];
    const nodes: ChmTocNode[] = [];
    for (const child of Array.from(ul.children)) {
      if (flatCount >= CHM_LIMITS.maxTocItems) break;
      if (child.localName === "li") {
        const info = extractObject(child);
        const childLists = Array.from(child.children).filter((el) => el.localName === "ul");
        const children = childLists.flatMap((sub) => walkList(sub, depth + 1));
        if (info) {
          flatCount += 1;
          nodes.push({
            label: info.label,
            path: info.path,
            fragment: info.fragment,
            children,
          });
        } else if (children.length > 0) {
          nodes.push(...children);
        }
      } else if (child.localName === "ul") {
        const last = nodes[nodes.length - 1];
        const nested = walkList(child, depth + 1);
        if (last && nested.length > 0) {
          nodes[nodes.length - 1] = {
            ...last,
            children: [...last.children, ...nested],
          };
        } else {
          nodes.push(...nested);
        }
      }
    }
    return nodes;
  }

  const rootLists = Array.from(doc.querySelectorAll("ul")).filter(
    (ul) => !ul.parentElement || ul.parentElement.localName !== "li",
  );
  // Only walk top-level ULs whose ancestors contain no UL.
  const topLists = rootLists.filter((ul) => {
    let parent = ul.parentElement;
    while (parent) {
      if (parent.localName === "ul") return false;
      parent = parent.parentElement;
    }
    return true;
  });

  const tree = topLists.flatMap((ul) => walkList(ul, 0));
  return { tree, flatCount };
}

function flattenIndex(nodes: readonly ChmTocNode[], out: ChmIndexEntry[] = []): ChmIndexEntry[] {
  for (const node of nodes) {
    if (out.length >= CHM_LIMITS.maxTocItems) break;
    if (node.path) {
      out.push({ label: node.label, path: node.path, fragment: node.fragment });
    }
    if (node.children.length > 0) {
      flattenIndex(node.children, out);
    }
  }
  return out;
}

export async function readChmMetadata(
  directory: ChmDirectory,
  reader: ChmSectionReader,
  signal: AbortSignal,
): Promise<ChmMetadata> {
  const initialEncoding = encodingFromLcid(directory.lcid);

  let systemInfo = {
    title: "",
    compiledName: "",
    defaultTopic: "",
    hhcPath: "",
    hhkPath: "",
    encoding: initialEncoding,
  };

  const systemEntry = directory.byLowerPath.get("/#system");
  if (systemEntry) {
    const bytes = await reader.readEntry(systemEntry, CHM_LIMITS.maxSystemBytes, signal);
    systemInfo = parseSystemFile(bytes, initialEncoding);
  }

  const encoding = systemInfo.encoding;

  const hhcResolved =
    (systemInfo.hhcPath ? resolveChmEntry(directory, "/", systemInfo.hhcPath)?.entry : null) ??
    directory.entries.find((e) => !e.path.startsWith("::") && e.lowerPath.endsWith(".hhc")) ??
    null;

  const hhkResolved =
    (systemInfo.hhkPath ? resolveChmEntry(directory, "/", systemInfo.hhkPath)?.entry : null) ??
    directory.entries.find((e) => !e.path.startsWith("::") && e.lowerPath.endsWith(".hhk")) ??
    null;

  let tocTree: ChmTocNode[] = [];
  if (hhcResolved && hhcResolved.length > 0) {
    const hhcBytes = await reader.readEntry(hhcResolved, CHM_LIMITS.maxTopicBytes, signal);
    const hhcText = decodeChmText(hhcBytes, encoding, true);
    tocTree = parseSitemapHtml(hhcText, directory, hhcResolved.path).tree;
  }

  let indexEntries: ChmIndexEntry[] = [];
  if (hhkResolved && hhkResolved.length > 0) {
    const hhkBytes = await reader.readEntry(hhkResolved, CHM_LIMITS.maxTopicBytes, signal);
    const hhkText = decodeChmText(hhkBytes, encoding, true);
    indexEntries = flattenIndex(parseSitemapHtml(hhkText, directory, hhkResolved.path).tree);
  }

  const systemTopics: { title: string; url: string }[] = [];
  const topicsEntry = directory.byLowerPath.get("/#topics");
  const stringsEntry = directory.byLowerPath.get("/#strings");
  const urlTblEntry = directory.byLowerPath.get("/#urltbl");
  const urlStrEntry = directory.byLowerPath.get("/#urlstr");

  if (topicsEntry && urlTblEntry && urlStrEntry) {
    const [topicsBytes, stringsBytes, urlTblBytes, urlStrBytes] = await Promise.all([
      reader.readEntry(topicsEntry, CHM_LIMITS.maxSystemBytes, signal),
      stringsEntry ? reader.readEntry(stringsEntry, CHM_LIMITS.maxSystemBytes, signal) : Promise.resolve(new Uint8Array(0)),
      reader.readEntry(urlTblEntry, CHM_LIMITS.maxSystemBytes, signal),
      reader.readEntry(urlStrEntry, CHM_LIMITS.maxSystemBytes, signal),
    ]);

    const topicsView = new DataView(topicsBytes.buffer, topicsBytes.byteOffset, topicsBytes.byteLength);
    const urlTblView = new DataView(urlTblBytes.buffer, urlTblBytes.byteOffset, urlTblBytes.byteLength);
    const count = Math.min(Math.floor(topicsBytes.byteLength / 16), CHM_LIMITS.maxTopics);

    for (let i = 0; i < count; i += 1) {
      const base = i * 16;
      const titleOffset = topicsView.getInt32(base + 4, true);
      const urlTblOffset = topicsView.getUint32(base + 8, true);
      if (urlTblOffset + 12 > urlTblBytes.byteLength) continue;
      const urlStrOffset = urlTblView.getUint32(urlTblOffset + 8, true);
      const rawUrl = readUrlStrAt(urlStrBytes, urlStrOffset, encoding);
      if (!rawUrl) continue;
      const resolved = resolveChmEntry(directory, "/", rawUrl);
      if (!resolved) continue;
      const topicTitle = titleOffset >= 0 ? readStringsAt(stringsBytes, titleOffset, encoding) : "";
      systemTopics.push({ title: topicTitle, url: resolved.entry.path });
    }
  }

  let defaultTopic = "";
  if (systemInfo.defaultTopic) {
    const resolved = resolveChmEntry(directory, "/", systemInfo.defaultTopic);
    if (resolved) defaultTopic = resolved.entry.path;
  }

  return {
    title: systemInfo.title,
    compiledName: systemInfo.compiledName,
    encoding,
    defaultTopic,
    hhcPath: hhcResolved?.path ?? "",
    hhkPath: hhkResolved?.path ?? "",
    tocTree,
    indexEntries,
    systemTopics,
  };
}
