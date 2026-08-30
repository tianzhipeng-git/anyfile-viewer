import { readFileRange } from "@anyfile/dev-binary-core";
import { ViewerError } from "@anyfile/viewer-protocol";

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_MAPPINGS = 1_000_000;
const MAX_SOURCES = 100_000;
const MAX_NAMES = 200_000;
const MAX_INDEX_DEPTH = 8;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUES = new Map([...BASE64].map((character, index) => [character, index]));

type JsonObject = Record<string, unknown>;
export type SourceInfo = { readonly path: string; readonly content: string | null; readonly ignored: boolean };
export type DecodedMapping = {
  readonly generatedLine: number;
  readonly generatedColumn: number;
  readonly sourceIndex?: number;
  readonly originalLine?: number;
  readonly originalColumn?: number;
  readonly nameIndex?: number;
};
export type SourceMapDocument = {
  readonly file?: string;
  readonly sources: readonly SourceInfo[];
  readonly names: readonly string[];
  readonly mappings: readonly DecodedMapping[];
  readonly generatedLines: number;
  readonly sections: number;
  readonly warnings: readonly string[];
};

function invalid(message: string): never {
  throw new ViewerError("invalid-file", message);
}

function limit(message: string): never {
  throw new ViewerError("resource-limit", message);
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} 必须是对象。`);
  return value as JsonObject;
}

function stringArray(value: unknown, label: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== "string")) {
    if (Array.isArray(value) && value.length > maximum) limit(`${label} 数量超过安全上限。`);
    invalid(`${label} 必须是字符串数组。`);
  }
  return value as string[];
}

function integer(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid(`${label} 必须是非负整数。`);
  return value as number;
}

function joinedSource(root: unknown, source: string) {
  if (typeof root !== "string" || !root) return source;
  return `${root.replace(/\/$/, "")}/${source.replace(/^\//, "")}`;
}

export function displaySourcePath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized.startsWith("/") && !/^[a-z]:\//i.test(normalized)) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  return parts.length <= 3 ? parts.join("/") : `…/${parts.slice(-3).join("/")}`;
}

function decodeVlq(text: string, start: number) {
  let value = 0;
  let shift = 0;
  let position = start;
  for (let count = 0; count < 10; count += 1) {
    if (position >= text.length) invalid("Source map VLQ 已截断。");
    const digit = BASE64_VALUES.get(text[position]);
    if (digit === undefined) invalid("Source map mappings 含有无效 Base64 字符。");
    position += 1;
    value += (digit & 31) * 2 ** shift;
    if (!Number.isSafeInteger(value)) invalid("Source map VLQ 数值过大。");
    if ((digit & 32) === 0) return { value: (value & 1) ? -Math.floor(value / 2) : Math.floor(value / 2), position };
    shift += 5;
  }
  invalid("Source map VLQ 超过允许长度。");
}

type DecodeState = { source: number; originalLine: number; originalColumn: number; name: number };

function decodeMappings(
  encoded: string,
  sourceLookup: readonly number[],
  nameLookup: readonly number[],
  lineOffset: number,
  columnOffset: number,
  output: DecodedMapping[],
) {
  if (encoded.length === 0) return 0;
  const state: DecodeState = { source: 0, originalLine: 0, originalColumn: 0, name: 0 };
  let localLine = 0;
  let generatedColumn = 0;
  let position = 0;
  while (position < encoded.length) {
    const character = encoded[position];
    if (character === ";") {
      localLine += 1;
      generatedColumn = 0;
      position += 1;
      continue;
    }
    if (character === ",") invalid("Source map mappings 含有空 segment。");
    const values: number[] = [];
    while (position < encoded.length && encoded[position] !== "," && encoded[position] !== ";") {
      const decoded = decodeVlq(encoded, position);
      values.push(decoded.value);
      position = decoded.position;
      if (values.length > 5) invalid("Source map segment 字段过多。");
    }
    if (values.length !== 1 && values.length !== 4 && values.length !== 5) invalid("Source map segment 字段数量无效。");
    generatedColumn += values[0];
    if (generatedColumn < 0) invalid("Source map generated column 不能为负数。");
    const mapping: DecodedMapping = {
      generatedLine: lineOffset + localLine,
      generatedColumn: generatedColumn + (localLine === 0 ? columnOffset : 0),
    };
    if (values.length >= 4) {
      state.source += values[1];
      state.originalLine += values[2];
      state.originalColumn += values[3];
      if (state.source < 0 || state.source >= sourceLookup.length || state.originalLine < 0 || state.originalColumn < 0) {
        invalid("Source map segment 引用了无效源位置。");
      }
      Object.assign(mapping, {
        sourceIndex: sourceLookup[state.source],
        originalLine: state.originalLine,
        originalColumn: state.originalColumn,
      });
      if (values.length === 5) {
        state.name += values[4];
        if (state.name < 0 || state.name >= nameLookup.length) invalid("Source map segment 引用了无效名称。");
        Object.assign(mapping, { nameIndex: nameLookup[state.name] });
      }
    }
    output.push(mapping);
    if (output.length > MAX_MAPPINGS) limit("Source map 映射数量超过安全上限。");
    if (position < encoded.length && encoded[position] === ",") {
      position += 1;
      if (position >= encoded.length || encoded[position] === "," || encoded[position] === ";") {
        invalid("Source map mappings 含有空 segment。");
      }
    }
  }
  return localLine + 1;
}

type Builder = {
  sources: SourceInfo[];
  names: string[];
  mappings: DecodedMapping[];
  warnings: string[];
  generatedLines: number;
  sections: number;
};

function ignoreIndices(map: JsonObject, sourceCount: number) {
  const value = map.ignoreList ?? map.x_google_ignoreList ?? [];
  if (!Array.isArray(value)) invalid("Source map ignoreList 必须是数组。");
  const result = new Set<number>();
  for (const item of value) {
    const index = integer(item, "ignoreList 索引");
    if (index >= sourceCount) invalid("Source map ignoreList 索引越界。");
    result.add(index);
  }
  return result;
}

function parseBasic(map: JsonObject, line: number, column: number, builder: Builder) {
  const sources = stringArray(map.sources, "sources", MAX_SOURCES);
  const names = stringArray(map.names ?? [], "names", MAX_NAMES);
  const mappings = map.mappings;
  if (typeof mappings !== "string") invalid("Source map mappings 必须是字符串。");
  const contents = map.sourcesContent;
  if (contents !== undefined && (!Array.isArray(contents) || contents.length !== sources.length
      || contents.some((item) => item !== null && typeof item !== "string"))) {
    invalid("Source map sourcesContent 必须与 sources 一一对应。");
  }
  if (builder.sources.length + sources.length > MAX_SOURCES) limit("Source map sources 数量超过安全上限。");
  if (builder.names.length + names.length > MAX_NAMES) limit("Source map names 数量超过安全上限。");
  const ignored = ignoreIndices(map, sources.length);
  const sourceLookup = sources.map((source, index) => {
    const global = builder.sources.length;
    builder.sources.push({
      path: joinedSource(map.sourceRoot, source),
      content: contents ? (contents[index] as string | null) : null,
      ignored: ignored.has(index),
    });
    return global;
  });
  const nameLookup = names.map((name) => {
    const global = builder.names.length;
    builder.names.push(name);
    return global;
  });
  const lines = decodeMappings(mappings, sourceLookup, nameLookup, line, column, builder.mappings);
  builder.generatedLines = Math.max(builder.generatedLines, line + lines);
}

function parseMap(value: unknown, line: number, column: number, depth: number, builder: Builder) {
  if (depth > MAX_INDEX_DEPTH) limit("Indexed source map 嵌套过深。");
  const map = object(value, "Source map");
  if (map.version !== 3) invalid("只支持 source map version 3。");
  if (map.sections === undefined) {
    parseBasic(map, line, column, builder);
    return;
  }
  if (!Array.isArray(map.sections)) invalid("Indexed source map sections 必须是数组。");
  let previousLine = -1;
  let previousColumn = -1;
  for (const rawSection of map.sections) {
    const section = object(rawSection, "Indexed source map section");
    const offset = object(section.offset, "Indexed source map offset");
    const sectionLine = integer(offset.line, "section line");
    const sectionColumn = integer(offset.column, "section column");
    if (sectionLine < previousLine || (sectionLine === previousLine && sectionColumn <= previousColumn)) {
      invalid("Indexed source map section offset 必须严格递增。");
    }
    previousLine = sectionLine;
    previousColumn = sectionColumn;
    builder.sections += 1;
    if (section.map !== undefined) {
      parseMap(section.map, line + sectionLine, sectionLine === 0 ? column + sectionColumn : sectionColumn, depth + 1, builder);
    } else if (typeof section.url === "string") {
      builder.warnings.push(`未加载外部 section：${displaySourcePath(section.url)}`);
    } else {
      invalid("Indexed source map section 必须包含 map 或 url。");
    }
  }
}

export async function parseSourceMap(file: File, signal: AbortSignal): Promise<SourceMapDocument> {
  if (file.size > MAX_FILE_BYTES) limit("Source map 文件超过 32 MiB 安全上限。");
  try {
    const bytes = await readFileRange(file, signal, 0, file.size);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const root = object(JSON.parse(text), "Source map");
    const builder: Builder = { sources: [], names: [], mappings: [], warnings: [], generatedLines: 0, sections: 0 };
    parseMap(root, 0, 0, 0, builder);
    builder.mappings.sort((left, right) => left.generatedLine - right.generatedLine || left.generatedColumn - right.generatedColumn);
    return {
      file: typeof root.file === "string" ? root.file : undefined,
      sources: builder.sources,
      names: builder.names,
      mappings: builder.mappings,
      generatedLines: builder.generatedLines,
      sections: builder.sections,
      warnings: builder.warnings,
    };
  } catch (error) {
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    invalid("文件不是有效的 ECMA-426 source map。");
  }
}

export function findOriginalPosition(document: SourceMapDocument, line: number, column: number) {
  let match: DecodedMapping | undefined;
  for (const mapping of document.mappings) {
    if (mapping.generatedLine > line) break;
    if (mapping.generatedLine === line && mapping.generatedColumn <= column) match = mapping;
  }
  return match?.generatedLine === line && match.sourceIndex !== undefined ? match : undefined;
}
