import type { WasmModule } from "./parser";
import { wasmStyles } from "./styles";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]) {
  if (rows.length === 0) return element("p", "无");
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

function section(viewport: HTMLElement, title: string, headers: readonly string[], rows: readonly (readonly string[])[]) {
  viewport.append(element("h2", title));
  const content = table(headers, rows);
  if (content.tagName === "P") content.className = "anyfile-wasm-viewer__empty";
  viewport.append(content);
}

export function createWasmView(fileName: string, wasmModule: WasmModule) {
  const root = element("div");
  root.className = "anyfile-wasm-viewer";
  const style = element("style");
  style.textContent = wasmStyles;
  const header = element("header");
  header.className = "anyfile-wasm-viewer__header";
  const title = element("strong", fileName);
  title.title = fileName;
  header.append(title, element("span", "WebAssembly 结构预览 · 不实例化、不执行"));
  const viewport = element("div");
  viewport.className = "anyfile-wasm-viewer__viewport";
  const summary = element("dl");
  summary.className = "anyfile-wasm-viewer__summary";
  const pairs = [
    ["版本", String(wasmModule.version)], ["Sections", String(wasmModule.sections.length)],
    ["类型", String(wasmModule.types.length)], ["导入", String(wasmModule.imports.length)],
    ["导出", String(wasmModule.exports.length)], ["函数体", String(wasmModule.functions.length)],
    ["内存", String(wasmModule.memories.length)], ["表", String(wasmModule.tables.length)],
  ];
  for (const [term, value] of pairs) {
    const item = element("div");
    item.append(element("dt", term), element("dd", value));
    summary.append(item);
  }
  viewport.append(summary);
  section(viewport, "Sections", ["ID", "名称", "字节", "条目"], wasmModule.sections.map((item) => [
    String(item.id), item.name, String(item.size), item.count === undefined ? "—" : String(item.count),
  ]));
  section(viewport, "类型", ["索引", "签名"], wasmModule.types.map((item, index) => [
    String(index), `(${item.params.join(", ")}) → ${item.results.length ? item.results.join(", ") : "void"}`,
  ]));
  section(viewport, "导入", ["模块", "名称", "种类", "详情"], wasmModule.imports.map((item) => [item.module, item.name, item.kind, item.detail]));
  section(viewport, "导出", ["名称", "种类", "索引"], wasmModule.exports.map((item) => [item.name, item.kind, String(item.index)]));
  section(viewport, "函数体", ["函数", "类型索引", "字节"], wasmModule.functions.map((item, index) => [String(index), String(item.typeIndex), String(item.bodySize)]));
  section(viewport, "内存与表", ["种类", "详情"], [
    ...wasmModule.memories.map((value) => ["memory", value]), ...wasmModule.tables.map((value) => ["table", value]),
  ]);
  section(viewport, "自定义 Sections", ["名称", "负载字节"], wasmModule.customSections.map((item) => [item.name || "（空名称）", String(item.size)]));
  if (wasmModule.startFunction !== undefined) viewport.append(element("p", `Start function: ${wasmModule.startFunction}`));
  root.append(style, header, viewport);
  return root;
}
