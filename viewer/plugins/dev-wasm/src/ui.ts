import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import {
  createDataTable,
  createInspectorShell,
  createKeyValueList,
  createSection,
  el,
} from "@anyfile/viewer-ui";

import type { WasmModule } from "./parser";

function tableSection(
  title: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  empty: string,
) {
  if (rows.length === 0) {
    return createSection(title, el("p", "anyfile-inspector__muted", empty));
  }
  const table = createDataTable({
    columns: headers.map((label) => ({ label })),
    rows,
    stickyHeader: false,
    bordered: true,
  });
  return createSection(title, table.element);
}

export function createWasmView(fileName: string, wasmModule: WasmModule, locale: Locale) {
  const copy = selectMessages(locale, {
    en: { empty: "None", description: "WebAssembly structure preview · never instantiated or executed", version: "Version", types: "Types", imports: "Imports", exports: "Exports", functions: "Function bodies", memories: "Memories", tables: "Tables", name: "Name", bytes: "Bytes", entries: "Entries", index: "Index", signature: "Signature", module: "Module", kind: "Kind", details: "Details", function: "Function", typeIndex: "Type index", memoryTables: "Memories and tables", custom: "Custom sections", payload: "Payload bytes", emptyName: "(empty name)" },
    "zh-CN": { empty: "无", description: "WebAssembly 结构预览 · 不实例化、不执行", version: "版本", types: "类型", imports: "导入", exports: "导出", functions: "函数体", memories: "内存", tables: "表", name: "名称", bytes: "字节", entries: "条目", index: "索引", signature: "签名", module: "模块", kind: "种类", details: "详情", function: "函数", typeIndex: "类型索引", memoryTables: "内存与表", custom: "自定义 Sections", payload: "负载字节", emptyName: "（空名称）" },
  });

  const shell = createInspectorShell({
    className: "anyfile-wasm-viewer",
    title: fileName,
    subtitle: copy.description,
    viewportClassName: "anyfile-wasm-viewer__viewport",
  });

  shell.viewport.append(
    createKeyValueList([
      { label: copy.version, value: String(wasmModule.version) },
      { label: "Sections", value: String(wasmModule.sections.length) },
      { label: copy.types, value: String(wasmModule.types.length) },
      { label: copy.imports, value: String(wasmModule.imports.length) },
      { label: copy.exports, value: String(wasmModule.exports.length) },
      { label: copy.functions, value: String(wasmModule.functions.length) },
      { label: copy.memories, value: String(wasmModule.memories.length) },
      { label: copy.tables, value: String(wasmModule.tables.length) },
    ], { variant: "cards" }),
    tableSection("Sections", ["ID", copy.name, copy.bytes, copy.entries], wasmModule.sections.map((item) => [
      String(item.id), item.name, String(item.size), item.count === undefined ? "—" : String(item.count),
    ]), copy.empty),
    tableSection(copy.types, [copy.index, copy.signature], wasmModule.types.map((item, index) => [
      String(index), `(${item.params.join(", ")}) → ${item.results.length ? item.results.join(", ") : "void"}`,
    ]), copy.empty),
    tableSection(copy.imports, [copy.module, copy.name, copy.kind, copy.details], wasmModule.imports.map((item) => [
      item.module, item.name, item.kind, item.detail,
    ]), copy.empty),
    tableSection(copy.exports, [copy.name, copy.kind, copy.index], wasmModule.exports.map((item) => [
      item.name, item.kind, String(item.index),
    ]), copy.empty),
    tableSection(copy.functions, [copy.function, copy.typeIndex, copy.bytes], wasmModule.functions.map((item, index) => [
      String(index), String(item.typeIndex), String(item.bodySize),
    ]), copy.empty),
    tableSection(copy.memoryTables, [copy.kind, copy.details], [
      ...wasmModule.memories.map((value) => ["memory", value]),
      ...wasmModule.tables.map((value) => ["table", value]),
    ], copy.empty),
    tableSection(copy.custom, [copy.name, copy.payload], wasmModule.customSections.map((item) => [
      item.name || copy.emptyName, String(item.size),
    ]), copy.empty),
  );
  if (wasmModule.startFunction !== undefined) {
    shell.viewport.append(el("p", undefined, `Start function: ${wasmModule.startFunction}`));
  }

  return shell.root;
}
