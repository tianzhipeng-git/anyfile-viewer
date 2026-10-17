import type { Sheet, Topic } from "./parse";
import type { MindMapCopy } from "./messages";

export const BRANCH_PAGE_SIZE = 100;
export function createMindMapView(sheets: Sheet[], copy: MindMapCopy) {
  const root = document.createElement("section");
  root.className = "anyfile-mind-map";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-mind-map { box-sizing:border-box; width:100%; height:100%; min-height:0; display:flex; flex-direction:column; overflow:hidden; color:var(--viewer-foreground,#222); background:var(--viewer-background,#fff); font-family:var(--viewer-font-family,system-ui); }
    .anyfile-mind-map * { box-sizing:border-box; }
    .anyfile-mind-map .mm-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px; flex:none; border-bottom:1px solid var(--viewer-border,#ccc); }
    .anyfile-mind-map button,.anyfile-mind-map select { font:inherit; color:inherit; background:var(--viewer-background,#fff); border:1px solid var(--viewer-border,#ccc); border-radius:8px; padding:8px 12px; cursor:pointer; max-width:100%; }
    .anyfile-mind-map button:focus-visible,.anyfile-mind-map select:focus-visible { outline:2px solid var(--viewer-accent,#4169e1); outline-offset:2px; }
    .anyfile-mind-map button:disabled { opacity:.5; cursor:default; }
    .anyfile-mind-map select { min-width:0; max-width:180px; }
    .anyfile-mind-map .mm-viewport { flex:1; min-height:0; min-width:0; overflow:auto; padding:20px; }
    .anyfile-mind-map .mm-map { display:flex; align-items:center; gap:32px; min-width:400px; }
    .anyfile-mind-map .mm-topic { flex:0 0 200px; width:200px; border:2px solid var(--viewer-accent,#4169e1); border-radius:12px; padding:16px; overflow-wrap:anywhere; white-space:pre-wrap; }
    .anyfile-mind-map .mm-branches { flex:1; min-width:180px; max-width:600px; margin:0; padding:0 0 0 24px; list-style:none; border-left:2px solid var(--viewer-border,#ccc); }
    .anyfile-mind-map .mm-branches li { position:relative; margin:12px 0; }
    .anyfile-mind-map .mm-branches li::before { content:''; position:absolute; width:24px; left:-24px; top:50%; border-top:2px solid var(--viewer-border,#ccc); }
    .anyfile-mind-map .mm-branches button { text-align:start; white-space:pre-wrap; overflow-wrap:anywhere; width:100%; }
    .anyfile-mind-map .mm-notes { white-space:pre-wrap; overflow-wrap:anywhere; }
    .anyfile-mind-map .mm-limitations { font-size:.85em; opacity:.8; }
    .anyfile-mind-map .mm-paging { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:16px 0; }
  `;
  const toolbar = document.createElement("div");
  toolbar.className = "mm-toolbar";
  const selector = document.createElement("select");
  selector.setAttribute("aria-label", copy.sheet);
  sheets.forEach((sheet, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = sheet.title || `${copy.sheet} ${index + 1}`;
    selector.append(option);
  });
  const viewport = document.createElement("div");
  viewport.className = "mm-viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", copy.diagram);
  let path: Topic[] = [sheets[0].root], page = 0, disposed = false;
  const listeners = new AbortController();
  const button = (label: string, action: () => void) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    // Property listeners on transient buttons disappear with the removed nodes.
    element.onclick = () => { if (!disposed) action(); };
    return element;
  };
  const parent = button(copy.parent, () => { path.pop(); page = 0; render(true); });
  const home = button(copy.home, () => { path = [path[0]]; page = 0; render(true); });
  selector.addEventListener("change", () => {
    path = [sheets[Number(selector.value)].root]; page = 0; render(false);
  }, { signal: listeners.signal });
  toolbar.append(selector, home, parent);
  root.append(style, toolbar, viewport);

  function render(focus: boolean) {
    if (disposed) return;
    const current = path.at(-1)!;
    parent.disabled = home.disabled = path.length === 1;
    const fragment = document.createDocumentFragment();
    const limitation = document.createElement("p");
    limitation.className = "mm-limitations";
    limitation.textContent = copy.limitation;
    const map = document.createElement("div");
    map.className = "mm-map";
    const heading = document.createElement("h2");
    heading.className = "mm-topic";
    heading.tabIndex = -1;
    heading.textContent = current.title || copy.untitled;
    const branches = document.createElement("ul");
    branches.className = "mm-branches";
    branches.setAttribute("aria-label", copy.branches);
    for (const node of current.children.slice(page * BRANCH_PAGE_SIZE, (page + 1) * BRANCH_PAGE_SIZE)) {
      const item = document.createElement("li");
      item.append(button(`${node.title || copy.untitled} (${node.children.length})`, () => {
        path.push(node); page = 0; render(true);
      }));
      branches.append(item);
    }
    if (!current.children.length) {
      const empty = document.createElement("li"); empty.textContent = copy.leaf; branches.append(empty);
    }
    map.append(heading, branches);
    fragment.append(limitation, map);
    const paging = document.createElement("div");
    paging.className = "mm-paging";
    const previous = button(copy.previous, () => { page--; render(true); });
    const next = button(copy.next, () => { page++; render(true); });
    previous.disabled = page === 0;
    next.disabled = (page + 1) * BRANCH_PAGE_SIZE >= current.children.length;
    const count = document.createElement("span");
    count.textContent = `${copy.branches}: ${current.children.length ? page * BRANCH_PAGE_SIZE + 1 : 0}–${Math.min((page + 1) * BRANCH_PAGE_SIZE, current.children.length)} / ${current.children.length}`;
    paging.append(previous, count, next);
    fragment.append(paging);
    for (const [label, value] of [[copy.notes, current.notes], [copy.link, current.link]]) {
      if (!value) continue;
      const section = document.createElement("section");
      const title = document.createElement("h3"); title.textContent = label;
      const content = document.createElement("p"); content.className = "mm-notes"; content.textContent = value;
      section.append(title, content); fragment.append(section);
    }
    viewport.replaceChildren(fragment);
    viewport.scrollTop = viewport.scrollLeft = 0;
    if (focus) heading.focus({ preventScroll: true });
  }
  render(false);
  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.abort();
      root.querySelectorAll("button").forEach((element) => { element.onclick = null; });
      root.replaceChildren();
      root.remove();
      path = [];
      sheets = [];
    },
  };
}
