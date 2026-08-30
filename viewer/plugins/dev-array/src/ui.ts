import type { NpyDescriptor, ArrayPage } from "./npy";
import { arrayPageSize, readArrayPage, readNpyDescriptor } from "./npy";
import type { ArrayByteSource } from "./source";
import { arrayViewerStyles } from "./ui-styles";

const PAGE_SIZE = 100;
export const DEV_ARRAY_VIEWER_BUILD_MARKER = "__anyfile_dev_array_viewer_v1__";

export type ArrayChoice = {
  readonly name: string;
  readonly size: number;
  readonly compressedSize?: number;
  open(): Promise<ArrayByteSource>;
};

type Copy = {
  readonly array: string;
  readonly previous: string;
  readonly next: string;
  readonly empty: string;
  readonly objectWarning: string;
  readonly loading: string;
  readonly error: string;
};

function copyFor(locale: string): Copy {
  if (!locale.toLowerCase().startsWith("zh")) {
    return {
      array: "Array", previous: "Previous", next: "Next", empty: "This NPZ contains no NPY arrays.",
      objectWarning: "Object dtype is inspection-only. Embedded Pickle data was not deserialized.",
      loading: "Reading array page…", error: "This array could not be read.",
    };
  }
  return {
    array: "数组", previous: "上一页", next: "下一页", empty: "这个 NPZ 中没有 NPY 数组。",
    objectWarning: "对象 dtype 仅提供结构检查；未反序列化其中的 Pickle 数据。",
    loading: "正在读取数组页…", error: "无法读取这个数组。",
  };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  return value;
}

function text(parent: HTMLElement, tag: keyof HTMLElementTagNameMap, value: string, className?: string) {
  const child = element(tag, className);
  child.textContent = value;
  parent.append(child);
  return child;
}

function shapeText(shape: readonly number[]) {
  return shape.length ? `(${shape.join(", ")}${shape.length === 1 ? "," : ""})` : "()";
}

function metadataRows(descriptor: NpyDescriptor) {
  return [
    ["NPY 版本", descriptor.version],
    ["dtype", descriptor.dtype.source],
    ["shape", shapeText(descriptor.shape)],
    ["存储顺序", descriptor.fortranOrder ? "Fortran" : "C"],
    ["元素数量", descriptor.elementCount.toLocaleString()],
    ["元素大小", `${descriptor.dtype.itemSize.toLocaleString()} 字节`],
  ] as const;
}

function renderPage(table: HTMLTableElement, page: ArrayPage) {
  const head = element("thead");
  const headerRow = element("tr");
  for (const column of page.columns) {
    const cell = text(headerRow, "th", column) as HTMLTableCellElement;
    cell.scope = "col";
  }
  head.append(headerRow);
  const body = element("tbody");
  for (const values of page.rows) {
    const row = element("tr");
    for (const value of values) text(row, "td", value);
    body.append(row);
  }
  table.replaceChildren(head, body);
}

export async function createArrayView(
  fileName: string,
  choices: readonly ArrayChoice[],
  locale: string,
  signal: AbortSignal,
) {
  const copy = copyFor(locale);
  const root = element("div", "anyfile-array-viewer");
  root.dataset.arrayViewerBuild = DEV_ARRAY_VIEWER_BUILD_MARKER;
  const style = element("style");
  style.textContent = arrayViewerStyles;
  const header = element("header", "anyfile-array-viewer__header");
  const title = text(header, "strong", fileName);
  title.title = fileName;
  text(header, "span", choices.length === 1 ? choices[0].name : `${choices.length} 个数组`);
  const controls = element("div", "anyfile-array-viewer__controls");
  const label = text(controls, "label", copy.array);
  const select = element("select");
  select.setAttribute("aria-label", copy.array);
  for (const [index, choice] of choices.entries()) {
    const option = element("option");
    option.value = String(index);
    option.textContent = choice.name;
    select.append(option);
  }
  label.append(select);
  const previous = element("button");
  previous.type = "button";
  previous.textContent = copy.previous;
  const next = element("button");
  next.type = "button";
  next.textContent = copy.next;
  const pageMeta = text(controls, "span", "", "anyfile-array-viewer__muted");
  controls.append(previous, next);
  const metadata = element("dl", "anyfile-array-viewer__metadata");
  const notice = text(root, "p", "", "anyfile-array-viewer__notice");
  notice.hidden = true;
  const viewport = element("div", "anyfile-array-viewer__viewport");
  const status = text(viewport, "p", copy.loading, "anyfile-array-viewer__status");
  status.setAttribute("role", "status");
  const table = element("table", "anyfile-array-viewer__table");
  viewport.append(table);
  root.prepend(style, header, controls, metadata);
  root.append(viewport);

  let source: ArrayByteSource | undefined;
  let descriptor: NpyDescriptor | undefined;
  let pageIndex = 0;
  let disposed = false;

  const setBusy = (busy: boolean) => {
    select.disabled = busy;
    previous.disabled = busy || pageIndex === 0;
    next.disabled = busy || !descriptor || descriptor.dtype.object ||
      (pageIndex + 1) * arrayPageSize(descriptor, PAGE_SIZE) >= descriptor.elementCount;
    status.hidden = !busy;
    if (busy) {
      status.textContent = copy.loading;
      status.setAttribute("role", "status");
    }
  };

  const showDescriptor = () => {
    metadata.replaceChildren();
    if (!descriptor) return;
    for (const [term, value] of metadataRows(descriptor)) {
      const item = element("div");
      text(item, "dt", term);
      text(item, "dd", value);
      metadata.append(item);
    }
  };

  const loadPage = async (targetPageIndex = pageIndex) => {
    if (!source || !descriptor || descriptor.dtype.object || descriptor.elementCount === 0) {
      table.replaceChildren();
      table.hidden = true;
      pageMeta.textContent = descriptor?.elementCount === 0 ? "0" : "";
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const page = await readArrayPage(source, descriptor, targetPageIndex, PAGE_SIZE);
      if (disposed || signal.aborted) return;
      pageIndex = targetPageIndex;
      renderPage(table, page);
      table.hidden = false;
      pageMeta.textContent = `${page.start + 1}–${page.end} / ${page.total.toLocaleString()}`;
    } finally {
      if (!disposed && !signal.aborted) setBusy(false);
    }
  };

  const showPageError = (error: unknown) => {
    if (disposed || signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
    status.textContent = error instanceof Error ? error.message : copy.error;
    status.hidden = false;
    status.setAttribute("role", "alert");
  };

  const loadChoice = async (index: number, surfaceError = true) => {
    setBusy(true);
    notice.hidden = true;
    table.hidden = true;
    pageMeta.textContent = "";
    pageIndex = 0;
    try {
      await source?.dispose?.();
      source = await choices[index].open();
      descriptor = await readNpyDescriptor(source);
      if (disposed || signal.aborted) return;
      showDescriptor();
      if (descriptor.dtype.object) {
        notice.textContent = copy.objectWarning;
        notice.hidden = false;
      }
      await loadPage();
    } catch (error) {
      await source?.dispose?.();
      source = undefined;
      if (disposed || signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (!surfaceError) throw error;
      status.textContent = error instanceof Error ? error.message : copy.error;
      status.hidden = false;
      status.setAttribute("role", "alert");
      select.disabled = false;
      previous.disabled = true;
      next.disabled = true;
    }
  };

  const onSelect = () => { void loadChoice(Number(select.value)); };
  const onPrevious = () => { void loadPage(pageIndex - 1).catch(showPageError); };
  const onNext = () => { void loadPage(pageIndex + 1).catch(showPageError); };
  select.addEventListener("change", onSelect);
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);

  if (choices.length) await loadChoice(0, false);
  else {
    status.textContent = copy.empty;
    status.hidden = false;
    select.disabled = true;
    previous.disabled = true;
    next.disabled = true;
  }

  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      select.removeEventListener("change", onSelect);
      previous.removeEventListener("click", onPrevious);
      next.removeEventListener("click", onNext);
      void source?.dispose?.();
      root.remove();
    },
  };
}
