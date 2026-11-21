import type { PublicationSource, TocTreeNode } from "./types";
import type { publicationCopy } from "./ui";

export function createPublicationSidebar(
  book: PublicationSource,
  copy: ReturnType<typeof publicationCopy>,
  onNavigate: (path: string, fragment: string) => void,
) {
  const hasTree = Boolean(book.tocTree?.length);
  const hasIndex = Boolean(book.index?.length);
  const sidebar = document.createElement("aside");
  sidebar.className = "anyfile-publication-reader__sidebar";
  sidebar.setAttribute("aria-label", copy.sidebar);

  const navButtons: { button: HTMLButtonElement; path: string }[] = [];
  const treePanel = document.createElement("div");
  treePanel.className = "anyfile-publication-reader__panel";
  const indexPanel = document.createElement("div");
  indexPanel.className = "anyfile-publication-reader__panel";

  if (hasTree && hasIndex) {
    const tabs = document.createElement("div");
    tabs.className = "anyfile-publication-reader__tabs";
    tabs.setAttribute("role", "tablist");
    const tocTab = document.createElement("button");
    tocTab.type = "button";
    tocTab.setAttribute("role", "tab");
    tocTab.textContent = copy.contents;
    const idxTab = document.createElement("button");
    idxTab.type = "button";
    idxTab.setAttribute("role", "tab");
    idxTab.textContent = copy.index;
    const selectTab = (mode: "toc" | "index") => {
      tocTab.setAttribute("aria-selected", String(mode === "toc"));
      idxTab.setAttribute("aria-selected", String(mode === "index"));
      treePanel.hidden = mode !== "toc";
      indexPanel.hidden = mode !== "index";
    };
    tocTab.onclick = () => selectTab("toc");
    idxTab.onclick = () => selectTab("index");
    tabs.append(tocTab, idxTab);
    sidebar.append(tabs);
    selectTab("toc");
  }

  function renderNodes(nodes: readonly TocTreeNode[]): HTMLUListElement {
    const ul = document.createElement("ul");
    ul.className = "anyfile-publication-reader__tree";
    for (const node of nodes) {
      const li = document.createElement("li");
      if (node.children.length > 0) {
        const details = document.createElement("details");
        details.open = true;
        const summary = document.createElement("summary");
        if (node.path) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = node.label;
          btn.onclick = () => onNavigate(node.path, node.fragment);
          navButtons.push({ button: btn, path: node.path });
          summary.append(btn);
        } else {
          summary.textContent = node.label;
        }
        details.append(summary, renderNodes(node.children));
        li.append(details);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = node.label;
        if (node.path) {
          btn.onclick = () => onNavigate(node.path, node.fragment);
          navButtons.push({ button: btn, path: node.path });
        } else {
          btn.disabled = true;
        }
        li.append(btn);
      }
      ul.append(li);
    }
    return ul;
  }

  if (hasTree && book.tocTree) {
    treePanel.append(renderNodes(book.tocTree));
    sidebar.append(treePanel);
  }

  if (hasIndex && book.index) {
    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "anyfile-publication-reader__filter";
    filter.placeholder = copy.filterIndex;
    filter.setAttribute("aria-label", copy.filterIndex);
    const list = document.createElement("ul");
    list.className = "anyfile-publication-reader__tree";
    const items = book.index.map((entry) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = entry.label;
      btn.onclick = () => onNavigate(entry.path, entry.fragment);
      navButtons.push({ button: btn, path: entry.path });
      li.append(btn);
      list.append(li);
      return { li, lower: entry.label.toLowerCase() };
    });
    filter.oninput = () => {
      const query = filter.value.trim().toLowerCase();
      for (const item of items) {
        item.li.hidden = Boolean(query && !item.lower.includes(query));
      }
    };
    indexPanel.append(filter, list);
    sidebar.append(indexPanel);
  }

  return {
    element: sidebar,
    setActive(path: string) {
      for (const item of navButtons) {
        if (item.path === path) item.button.setAttribute("aria-current", "page");
        else item.button.removeAttribute("aria-current");
      }
    },
  };
}
