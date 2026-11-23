import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import {
  createFilterInput,
  createInspectorShell,
  createKeyValueList,
  createSection,
  el,
  formatBytes,
  viewerTheme,
  type KeyValueItem,
} from "@anyfile/viewer-ui";

import type { PlistValue } from "./types";

function copyFor(locale: Locale) {
  return selectMessages(locale, {
    "zh-CN": {
      summary: "概览", root: "根节点", type: "根类型", entries: "条目", filter: "筛选键与值",
      empty: "没有匹配的条目", expand: "展开全部", collapse: "收起全部", noValue: "（空）",
      dict: "字典", array: "数组", string: "字符串", integer: "整数", real: "实数",
      boolean: "布尔", date: "日期", data: "数据", uid: "UID", null: "空值",
      key: "键", value: "值", kind: "类型", bytes: "字节", true: "真", false: "假",
    },
    en: {
      summary: "Overview", root: "Root", type: "Root type", entries: "Entries", filter: "Filter keys and values",
      empty: "No matching entries", expand: "Expand all", collapse: "Collapse all", noValue: "(empty)",
      dict: "Dictionary", array: "Array", string: "String", integer: "Integer", real: "Real",
      boolean: "Boolean", date: "Date", data: "Data", uid: "UID", null: "Null",
      key: "Key", value: "Value", kind: "Type", bytes: "bytes", true: "true", false: "false",
    },
  });
}

const extraStyles = `
  .anyfile-plist-viewer__tree { font-family: ${viewerTheme.fontMono}; font-size: 12.5px; padding: 4px 0 24px; }
  .anyfile-plist-viewer__node { padding-inline-start: 16px; }
  .anyfile-plist-viewer__row { display:flex; align-items:baseline; gap:6px; padding:2px 4px; border-radius:4px; }
    .anyfile-plist-viewer__toggle { cursor:pointer; width:14px; display:inline-block; color:${viewerTheme.muted}; user-select:none; }
  .anyfile-plist-viewer__key { color: ${viewerTheme.accent}; }
  .anyfile-plist-viewer__type { color:${viewerTheme.muted}; font-size:11px; }
  .anyfile-plist-viewer__value { overflow-wrap:anywhere; }
  .anyfile-plist-viewer__count { color:${viewerTheme.muted}; }
  .anyfile-plist-viewer__actions { display:flex; gap:8px; padding: 8px 0 12px; }
`;

type Summary = { dicts: number; arrays: number; scalars: number; maxDepth: number };

function summarize(value: PlistValue): Summary {
  const summary: Summary = { dicts: 0, arrays: 0, scalars: 0, maxDepth: 0 };
  const walk = (node: PlistValue, depth: number) => {
    summary.maxDepth = Math.max(summary.maxDepth, depth);
    if (node.kind === "dict") {
      summary.dicts += 1;
      for (const entry of node.entries) walk(entry.value, depth + 1);
    } else if (node.kind === "array") {
      summary.arrays += 1;
      for (const item of node.items) walk(item, depth + 1);
    } else {
      summary.scalars += 1;
    }
  };
  walk(value, 0);
  return summary;
}

function typeLabel(kind: PlistValue["kind"], copy: ReturnType<typeof copyFor>): string {
  return copy[kind];
}

function scalarText(value: PlistValue, copy: ReturnType<typeof copyFor>, locale: Locale): string {
  switch (value.kind) {
    case "string": return value.value;
    case "integer": return value.value.toString();
    case "real": return value.value.toString();
    case "boolean": return value.value ? copy.true : copy.false;
    case "date": return value.value.toLocaleString(locale);
    case "data": return `${formatBytes(value.value.byteLength, locale)} · ${hexPreview(value.value)}`;
    case "uid": return value.value.toString();
    case "null": return copy.noValue;
    default: return "";
  }
}

function hexPreview(bytes: Uint8Array): string {
  const head = bytes.subarray(0, 16);
  const hex = Array.from(head, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
  return bytes.length > 16 ? `${hex} …` : hex;
}

/** Renders one plist value as an expandable tree row plus its children. */
function renderValue(
  keyLabel: string | undefined,
  value: PlistValue,
  copy: ReturnType<typeof copyFor>,
  locale: Locale,
  parent: HTMLElement,
  filter: string,
): boolean {
  const row = el("div", "anyfile-plist-viewer__row");
  const node = el("div", "anyfile-plist-viewer__node");
  let matched = false;

  const keyNode = keyLabel !== undefined ? el("span", "anyfile-plist-viewer__key", `${keyLabel}:`) : undefined;
  const typeNode = el("span", "anyfile-plist-viewer__type", typeLabel(value.kind, copy));

  const selfMatch = filter === ""
    || (keyLabel?.toLowerCase().includes(filter) ?? false)
    || (value.kind !== "dict" && value.kind !== "array" && scalarText(value, copy, locale).toLowerCase().includes(filter));

  if (value.kind === "dict" || value.kind === "array") {
    const children = value.kind === "dict" ? value.entries : value.items.map((item) => ({ key: undefined as string | undefined, value: item }));
    const toggle = el("span", "anyfile-plist-viewer__toggle", "▾");
    const count = el("span", "anyfile-plist-viewer__count", `{ ${children.length} }`);
    row.append(toggle);
    if (keyNode) row.append(keyNode);
    row.append(typeNode, count);
    node.append(row);

    const childContainer = el("div");
    for (const child of children) {
      const childMatched = renderValue(
        value.kind === "dict" ? (child as { key: string }).key : undefined,
        child.value,
        copy,
        locale,
        childContainer,
        filter,
      );
      matched = matched || childMatched;
    }
    matched = matched || selfMatch || children.length === 0;
    if (!matched) return false;

    node.append(childContainer);
    let open = true;
    const applyOpen = () => {
      childContainer.hidden = !open;
      toggle.textContent = open ? "▾" : "▸";
    };
    applyOpen();
    toggle.addEventListener("click", () => {
      open = !open;
      applyOpen();
    });
  } else {
    const valueText = scalarText(value, copy, locale);
    row.append(el("span", "anyfile-plist-viewer__toggle"));
    if (keyNode) row.append(keyNode);
    row.append(typeNode, el("span", "anyfile-plist-viewer__value", valueText || copy.noValue));
    node.append(row);
    matched = selfMatch;
  }

  if (!matched) return false;
  parent.append(node);
  return true;
}

export function createPlistView(fileName: string, value: PlistValue, locale: Locale) {
  const copy = copyFor(locale);
  const summary = summarize(value);
  const rootType = typeLabel(value.kind, copy);

  const overviewItems: KeyValueItem[] = [
    { label: copy.type, value: rootType },
    { label: copy.dict, value: summary.dicts.toLocaleString(locale) },
    { label: copy.array, value: summary.arrays.toLocaleString(locale) },
    { label: copy.entries, value: summary.scalars.toLocaleString(locale) },
  ];

  const shell = createInspectorShell({
    className: "anyfile-plist-viewer",
    title: fileName,
    subtitle: copy.root + ": " + rootType,
    stats: [
      `${summary.dicts.toLocaleString(locale)} ${copy.dict}`,
      `${summary.arrays.toLocaleString(locale)} ${copy.array}`,
    ],
    layout: "split",
    extraStyles,
  });

  shell.sidebar!.append(
    createKeyValueList(overviewItems),
    createSection(copy.summary, el("p", "anyfile-inspector__muted", `${copy.entries}: ${summary.scalars.toLocaleString(locale)} · ${copy.type}: ${rootType}`), { headingLevel: 3 }),
  );

  const tree = el("div", "anyfile-plist-viewer__tree");
  const emptyHint = el("p", { className: "anyfile-inspector__muted", hidden: true }, copy.empty);

  const render = (filter: string) => {
    tree.replaceChildren();
    const container = el("div");
    const visible = renderValue(undefined, value, copy, locale, container, filter.toLowerCase());
    if (visible) tree.append(container);
    emptyHint.hidden = visible;
  };

  const filter = createFilterInput({
    placeholder: copy.filter,
    dataset: { plistFilter: "" },
    onInput: (next) => render(next),
  });

  const actions = el("div", "anyfile-plist-viewer__actions");
  const expandBtn = el("button", { className: "anyfile-inspector__btn", attrs: { type: "button" }, dataset: { plistExpand: "" } }, copy.expand);
  const collapseBtn = el("button", { className: "anyfile-inspector__btn", attrs: { type: "button" }, dataset: { plistCollapse: "" } }, copy.collapse);
  actions.append(expandBtn, collapseBtn);

  expandBtn.addEventListener("click", () => {
    for (const container of tree.querySelectorAll<HTMLElement>(".anyfile-plist-viewer__node > div:last-child")) {
      container.hidden = false;
    }
    for (const toggle of tree.querySelectorAll<HTMLElement>(".anyfile-plist-viewer__toggle")) {
      if (toggle.textContent === "▸") toggle.textContent = "▾";
    }
  });
  collapseBtn.addEventListener("click", () => {
    // Collapse every container except the outermost root children.
    const nodes = tree.querySelectorAll<HTMLElement>(".anyfile-plist-viewer__node");
    nodes.forEach((node, index) => {
      if (index === 0) return;
      const child = node.lastElementChild as HTMLElement | null;
      if (child) child.hidden = true;
      const toggle = node.firstElementChild?.firstElementChild as HTMLElement | null;
      if (toggle && toggle.classList.contains("anyfile-plist-viewer__toggle")) toggle.textContent = "▸";
    });
  });

  shell.header.append(filter.input, actions);
  shell.viewport.append(tree, emptyHint);
  shell.onDispose(() => filter.dispose());

  render("");
  return { root: shell.root, dispose: () => shell.dispose() };
}
