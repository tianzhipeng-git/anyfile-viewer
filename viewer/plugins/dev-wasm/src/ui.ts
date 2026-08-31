import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { WasmModule } from "./parser";
import { wasmStyles } from "./styles";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[], empty: string) {
  if (rows.length === 0) return element("p", empty);
  const node = element("table");
  const head = element("thead");
  const headerRow = element("tr");
  for (const header of headers) headerRow.append(element("th", header));
  head.append(headerRow);
  const body = element("tbody");
  for (const values of rows) {
    const row = element("tr");
    for (const value of values) row.append(element("td", value));
    body.append(row);
  }
  node.append(head, body);
  return node;
}

function section(viewport: HTMLElement, title: string, headers: readonly string[], rows: readonly (readonly string[])[], empty: string) {
  viewport.append(element("h2", title));
  const content = table(headers, rows, empty);
  if (content.tagName === "P") content.className = "anyfile-wasm-viewer__empty";
  viewport.append(content);
}

export function createWasmView(fileName: string, wasmModule: WasmModule, locale: Locale) {
  const copy = selectMessages(locale, {
    en: { empty: "None", description: "WebAssembly structure preview · never instantiated or executed", version: "Version", types: "Types", imports: "Imports", exports: "Exports", functions: "Function bodies", memories: "Memories", tables: "Tables", name: "Name", bytes: "Bytes", entries: "Entries", index: "Index", signature: "Signature", module: "Module", kind: "Kind", details: "Details", function: "Function", typeIndex: "Type index", memoryTables: "Memories and tables", custom: "Custom sections", payload: "Payload bytes", emptyName: "(empty name)" },
    "zh-CN": { empty: "无", description: "WebAssembly 结构预览 · 不实例化、不执行", version: "版本", types: "类型", imports: "导入", exports: "导出", functions: "函数体", memories: "内存", tables: "表", name: "名称", bytes: "字节", entries: "条目", index: "索引", signature: "签名", module: "模块", kind: "种类", details: "详情", function: "函数", typeIndex: "类型索引", memoryTables: "内存与表", custom: "自定义 Sections", payload: "负载字节", emptyName: "（空名称）" },
  });
  const empty = copy.empty;
  const root = element("div");
  root.className = "anyfile-wasm-viewer";
  const style = element("style");
  style.textContent = wasmStyles;
  const header = element("header");
  header.className = "anyfile-wasm-viewer__header";
  const title = element("strong", fileName);
  title.title = fileName;
  header.append(title, element("span", copy.description));
  const viewport = element("div");
  viewport.className = "anyfile-wasm-viewer__viewport";
  const summary = element("dl");
  summary.className = "anyfile-wasm-viewer__summary";
  const pairs = [
    [copy.version, String(wasmModule.version)], ["Sections", String(wasmModule.sections.length)],
    [copy.types, String(wasmModule.types.length)], [copy.imports, String(wasmModule.imports.length)],
    [copy.exports, String(wasmModule.exports.length)], [copy.functions, String(wasmModule.functions.length)],
    [copy.memories, String(wasmModule.memories.length)], [copy.tables, String(wasmModule.tables.length)],
  ];
  for (const [term, value] of pairs) {
    const item = element("div");
    item.append(element("dt", term), element("dd", value));
    summary.append(item);
  }
  viewport.append(summary);
  section(viewport, "Sections", ["ID", copy.name, copy.bytes, copy.entries], wasmModule.sections.map((item) => [
    String(item.id), item.name, String(item.size), item.count === undefined ? "—" : String(item.count),
  ]), empty);
  section(viewport, copy.types, [copy.index, copy.signature], wasmModule.types.map((item, index) => [
    String(index), `(${item.params.join(", ")}) → ${item.results.length ? item.results.join(", ") : "void"}`,
  ]), empty);
  section(viewport, copy.imports, [copy.module, copy.name, copy.kind, copy.details], wasmModule.imports.map((item) => [item.module, item.name, item.kind, item.detail]), empty);
  section(viewport, copy.exports, [copy.name, copy.kind, copy.index], wasmModule.exports.map((item) => [item.name, item.kind, String(item.index)]), empty);
  section(viewport, copy.functions, [copy.function, copy.typeIndex, copy.bytes], wasmModule.functions.map((item, index) => [String(index), String(item.typeIndex), String(item.bodySize)]), empty);
  section(viewport, copy.memoryTables, [copy.kind, copy.details], [
    ...wasmModule.memories.map((value) => ["memory", value]), ...wasmModule.tables.map((value) => ["table", value]),
  ], empty);
  section(viewport, copy.custom, [copy.name, copy.payload], wasmModule.customSections.map((item) => [item.name || copy.emptyName, String(item.size)]), empty);
  if (wasmModule.startFunction !== undefined) viewport.append(element("p", `Start function: ${wasmModule.startFunction}`));
  root.append(style, header, viewport);
  return root;
}
