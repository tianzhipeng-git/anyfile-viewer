import { CanvasSurface, InteractiveViewport, ResourceScope, type ViewTransform } from "@anyfile/viewer-rendering";
import { el } from "@anyfile/viewer-ui";
import type { DesignMessages } from "./i18n";
import { renderInspectorContent } from "./inspector";
import { computeContentBounds, type DesignBounds, type DesignDocument, type DesignNode, type DesignPage } from "./model";
import { hitTestDesignNode, renderDesignScene } from "./renderer";
import { designSourceStyles } from "./styles";

const MAX_RENDERED_TREE_ROWS = 1500;

function kindShortTag(kind: DesignNode["kind"]): string {
  switch (kind) {
    case "artboard": return "AB";
    case "frame": return "FR";
    case "group": return "GP";
    case "rectangle": return "RC";
    case "ellipse": return "EL";
    case "line": return "LN";
    case "vector": return "VC";
    case "text": return "TX";
    case "image": return "IM";
    case "component": return "CP";
    case "instance": return "IN";
    default: return "ND";
  }
}

function findNode(nodes: readonly DesignNode[], id: string): DesignNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

function nodeMatchesQuery(node: DesignNode, query: string): boolean {
  if (node.name.toLowerCase().includes(query)) return true;
  if (node.text?.content.toLowerCase().includes(query)) return true;
  if (node.rawType.toLowerCase().includes(query)) return true;
  return node.children.some((child) => nodeMatchesQuery(child, query));
}

export type DesignViewerInstance = {
  readonly root: HTMLElement;
  dispose(): void;
};

export function mountDesignSourceViewer(
  doc: DesignDocument,
  messages: DesignMessages,
  signal: AbortSignal,
): DesignViewerInstance {
  const resources = new ResourceScope();
  const root = el("div", { className: "anyfile-design-source-viewer" });
  const style = el("style", { text: designSourceStyles });

  let activePageIndex = 0;
  let focusedArtboardId: string | undefined;
  let selectedNodeId: string | undefined;
  let filterQuery = "";
  let viewMode: "canvas" | "preview" = doc.pages.length > 0 ? "canvas" : "preview";
  let currentTransform: ViewTransform = { scale: 1, rotation: 0, panX: 0, panY: 0 };

  const decodedImages = new Map<string, HTMLImageElement | ImageBitmap>();
  const objectUrls: string[] = [];

  const getActivePage = (): DesignPage | undefined => doc.pages[activePageIndex];
  const getFocusedArtboard = (): DesignNode | undefined => {
    const page = getActivePage();
    if (!page || !focusedArtboardId) return undefined;
    return page.artboards.find((a) => a.id === focusedArtboardId);
  };
  const getActiveRoots = (): readonly DesignNode[] => {
    const artboard = getFocusedArtboard();
    if (artboard) return [artboard];
    return getActivePage()?.rootNodes ?? [];
  };
  const getActiveContentBounds = (): DesignBounds => {
    const artboard = getFocusedArtboard();
    if (artboard) return artboard.absBounds;
    return computeContentBounds(getActivePage()?.rootNodes ?? []);
  };

  // Toolbar controls
  const titleEl = el("span", {
    className: "anyfile-design-source-viewer__title",
    text: doc.title,
    title: doc.title,
  });
  const formatBadge = el("span", {
    className: "anyfile-design-source-viewer__badge",
    text: doc.format === "figma" ? "FIGMA" : "SKETCH",
  });

  const pageSelect = el("select", {
    className: "anyfile-design-source-viewer__select",
    attrs: { "aria-label": messages.pageSelectorLabel },
    dataset: { pageSelect: "" },
  });
  doc.pages.forEach((page, index) => {
    pageSelect.append(el("option", { attrs: { value: String(index) }, text: page.name }));
  });
  pageSelect.hidden = doc.pages.length <= 1;

  const canvasModeBtn = el("button", {
    className: "anyfile-design-source-viewer__button",
    attrs: { type: "button" },
    text: messages.canvasView,
    dataset: { viewMode: "canvas" },
  });
  const previewModeBtn = el("button", {
    className: "anyfile-design-source-viewer__button",
    attrs: { type: "button" },
    text: messages.previewView,
    dataset: { viewMode: "preview" },
  });
  const modeGroup = el("div", { className: "anyfile-design-source-viewer__group" }, canvasModeBtn, previewModeBtn);
  modeGroup.hidden = !doc.thumbnail || doc.pages.length === 0;

  const zoomOutBtn = el("button", {
    className: "anyfile-design-source-viewer__button",
    attrs: { type: "button", "aria-label": messages.zoomOut },
    text: "−",
  });
  const zoomValue = el("output", { className: "anyfile-design-source-viewer__zoom-value", text: "100%" });
  const zoomInBtn = el("button", {
    className: "anyfile-design-source-viewer__button",
    attrs: { type: "button", "aria-label": messages.zoomIn },
    text: "+",
  });
  const fitBtn = el("button", {
    className: "anyfile-design-source-viewer__button",
    attrs: { type: "button" },
    text: messages.zoomFit,
  });
  const actualBtn = el("button", {
    className: "anyfile-design-source-viewer__button",
    attrs: { type: "button" },
    text: messages.zoomActual,
  });
  const hiddenRotateLeft = el("button", { attrs: { type: "button" }, hidden: true });
  const hiddenRotateRight = el("button", { attrs: { type: "button" }, hidden: true });

  const zoomGroup = el(
    "div",
    { className: "anyfile-design-source-viewer__group" },
    zoomOutBtn,
    zoomValue,
    zoomInBtn,
    fitBtn,
    actualBtn,
  );

  const toggleLayersBtn = el("button", {
    className: "anyfile-design-source-viewer__button",
    attrs: { type: "button", "aria-pressed": "true" },
    text: messages.toggleLayers,
    dataset: { toggleLayers: "" },
  });
  const toggleInspectorBtn = el("button", {
    className: "anyfile-design-source-viewer__button",
    attrs: { type: "button", "aria-pressed": "true" },
    text: messages.toggleInspector,
    dataset: { toggleInspector: "" },
  });

  const toolbar = el(
    "div",
    { className: "anyfile-design-source-viewer__toolbar" },
    titleEl,
    formatBadge,
    pageSelect,
    modeGroup,
    el("span", { className: "anyfile-design-source-viewer__spacer" }),
    zoomGroup,
    toggleLayersBtn,
    toggleInspectorBtn,
  );

  // Left sidebar: Artboards + Layer Tree
  const searchInput = el("input", {
    className: "anyfile-design-source-viewer__search",
    attrs: {
      type: "search",
      placeholder: messages.filterLayersPlaceholder,
      "aria-label": messages.filterLayersPlaceholder,
    },
    dataset: { layerFilter: "" },
  });
  const sidebarScroll = el("div", { className: "anyfile-design-source-viewer__panel-scroll" });
  const sidebar = el(
    "aside",
    { className: "anyfile-design-source-viewer__sidebar", dataset: { layersSidebar: "" } },
    el(
      "div",
      { className: "anyfile-design-source-viewer__panel-header" },
      el("span", { className: "anyfile-design-source-viewer__panel-title", text: messages.layersHeading }),
      searchInput,
    ),
    sidebarScroll,
  );
  if (doc.pages.length === 0) {
    sidebar.hidden = true;
    toggleLayersBtn.setAttribute("aria-pressed", "false");
  }

  // Center stage: Canvas viewport + Preview thumbnail
  const canvas = el("canvas", { className: "anyfile-design-source-viewer__canvas" });
  const viewportEl = el(
    "div",
    {
      className: "anyfile-design-source-viewer__viewport",
      role: "region",
      attrs: { tabindex: "0", "aria-label": messages.canvasAriaLabel },
      dataset: { canvasViewport: "" },
    },
    canvas,
  );

  const previewWrap = el("div", {
    className: "anyfile-design-source-viewer__preview-wrap",
    hidden: true,
    dataset: { previewWrap: "" },
  });
  if (doc.thumbnail) {
    const thumbBlob = new Blob([doc.thumbnail as BlobPart], { type: "image/png" });
    const thumbUrl = URL.createObjectURL(thumbBlob);
    objectUrls.push(thumbUrl);
    previewWrap.append(
      el("img", {
        className: "anyfile-design-source-viewer__preview-img",
        attrs: { src: thumbUrl, alt: messages.previewAlt },
      }),
    );
  }

  const stage = el("div", { className: "anyfile-design-source-viewer__stage" }, viewportEl, previewWrap);

  // Right sidebar: Inspector
  const inspectorScroll = el("div", {
    className: "anyfile-design-source-viewer__panel-scroll",
    dataset: { inspectorBody: "" },
  });
  const inspector = el(
    "aside",
    { className: "anyfile-design-source-viewer__inspector", dataset: { inspectorPanel: "" } },
    el(
      "div",
      { className: "anyfile-design-source-viewer__panel-header" },
      el("span", { className: "anyfile-design-source-viewer__panel-title", text: messages.inspectorHeading }),
    ),
    inspectorScroll,
  );

  const body = el("div", { className: "anyfile-design-source-viewer__body" }, sidebar, stage, inspector);
  root.append(style, toolbar, body);

  const initialBounds = getActiveContentBounds();
  const surface = new CanvasSurface(canvas, viewportEl, (ctx, width, height, dpr) => {
    const page = getActivePage();
    if (!page || viewMode !== "canvas") return;
    renderDesignScene(ctx, width, height, dpr, {
      page,
      focusedArtboard: getFocusedArtboard(),
      selectedNodeId,
      images: decodedImages,
      contentBounds: getActiveContentBounds(),
      transform: currentTransform,
    });
  });
  resources.add(() => surface.dispose());

  const interactiveViewport = new InteractiveViewport(
    {
      viewport: viewportEl,
      zoomValue,
      rotateLeft: hiddenRotateLeft,
      rotateRight: hiddenRotateRight,
      zoomIn: zoomInBtn,
      zoomOut: zoomOutBtn,
      fit: fitBtn,
      actual: actualBtn,
    },
    Math.max(1, initialBounds.width),
    Math.max(1, initialBounds.height),
    (transform) => {
      currentTransform = transform;
      surface.schedule();
    },
  );
  resources.add(() => interactiveViewport.dispose());

  const refreshInspector = () => {
    const selected = selectedNodeId ? findNode(getActivePage()?.rootNodes ?? [], selectedNodeId) : undefined;
    renderInspectorContent(inspectorScroll, doc, selected, messages);
  };

  const refreshSidebar = () => {
    const page = getActivePage();
    if (!page) {
      sidebarScroll.replaceChildren(
        el("div", { className: "anyfile-design-source-viewer__empty", text: messages.noLayers }),
      );
      return;
    }

    const fragment = document.createDocumentFragment();

    if (page.artboards.length > 0) {
      fragment.append(
        el("div", {
          className: "anyfile-design-source-viewer__panel-title",
          text: `${messages.artboardsHeading} (${page.artboards.length})`,
        }),
      );
      const abList = el("div", { className: "anyfile-design-source-viewer__artboard-list" });
      const allBtn = el(
        "button",
        {
          className: "anyfile-design-source-viewer__tree-row",
          attrs: { type: "button", "aria-selected": focusedArtboardId === undefined ? "true" : "false" },
          dataset: { artboardId: "__all__" },
        },
        el("span", { className: "anyfile-design-source-viewer__kind-tag", text: "PG" }),
        el("span", { className: "anyfile-design-source-viewer__tree-name", text: messages.allArtboards }),
      );
      allBtn.addEventListener("click", () => {
        focusedArtboardId = undefined;
        const b = getActiveContentBounds();
        interactiveViewport.setContentSize(Math.max(1, b.width), Math.max(1, b.height));
        refreshSidebar();
      });
      abList.append(allBtn);

      for (const ab of page.artboards) {
        const btn = el(
          "button",
          {
            className: "anyfile-design-source-viewer__tree-row",
            attrs: { type: "button", "aria-selected": focusedArtboardId === ab.id ? "true" : "false" },
            dataset: { artboardId: ab.id },
          },
          el("span", { className: "anyfile-design-source-viewer__kind-tag", text: "AB" }),
          el("span", { className: "anyfile-design-source-viewer__tree-name", text: ab.name, title: ab.name }),
        );
        btn.addEventListener("click", () => {
          focusedArtboardId = ab.id;
          selectedNodeId = ab.id;
          interactiveViewport.setContentSize(Math.max(1, ab.absBounds.width), Math.max(1, ab.absBounds.height));
          refreshSidebar();
          refreshInspector();
          surface.schedule();
        });
        abList.append(btn);
      }
      fragment.append(abList);
    }

    const treeList = el("ul", { className: "anyfile-design-source-viewer__tree", role: "tree" });
    const q = filterQuery.trim().toLowerCase();
    let renderedRows = 0;

    const appendNodes = (nodes: readonly DesignNode[], depth: number) => {
      for (const node of nodes) {
        if (renderedRows >= MAX_RENDERED_TREE_ROWS) return;
        if (q && !nodeMatchesQuery(node, q)) continue;
        renderedRows += 1;

        const rowBtn = el(
          "button",
          {
            className: "anyfile-design-source-viewer__tree-row",
            attrs: { type: "button", "aria-selected": selectedNodeId === node.id ? "true" : "false" },
            dataset: {
              nodeId: node.id,
              hiddenLayer: node.visible ? "false" : "true",
            },
          },
          el("span", { className: "anyfile-design-source-viewer__kind-tag", text: kindShortTag(node.kind) }),
          el("span", {
            className: "anyfile-design-source-viewer__tree-name",
            text: node.name,
            title: node.text?.content ? `${node.name}: ${node.text.content}` : node.name,
          }),
        );
        rowBtn.style.paddingLeft = `${6 + Math.min(depth, 10) * 14}px`;
        rowBtn.addEventListener("click", () => {
          selectedNodeId = node.id;
          refreshSidebar();
          refreshInspector();
          surface.schedule();
        });

        treeList.append(el("li", { role: "treeitem" }, rowBtn));
        if (node.children.length > 0) {
          appendNodes(node.children, depth + 1);
        }
      }
    };

    appendNodes(getActiveRoots(), 0);
    if (renderedRows === 0) {
      fragment.append(
        el("div", {
          className: "anyfile-design-source-viewer__empty",
          text: q ? messages.noMatchingLayers : messages.noLayers,
        }),
      );
    } else {
      fragment.append(treeList);
    }
    sidebarScroll.replaceChildren(fragment);
  };

  const applyViewMode = () => {
    const isPreview = viewMode === "preview";
    viewportEl.hidden = isPreview;
    previewWrap.hidden = !isPreview;
    zoomGroup.hidden = isPreview;
    canvasModeBtn.setAttribute("aria-pressed", String(!isPreview));
    previewModeBtn.setAttribute("aria-pressed", String(isPreview));
    if (!isPreview) surface.schedule();
  };

  resources.listen(pageSelect, "change", () => {
    activePageIndex = Number(pageSelect.value) || 0;
    focusedArtboardId = undefined;
    selectedNodeId = undefined;
    const b = getActiveContentBounds();
    interactiveViewport.setContentSize(Math.max(1, b.width), Math.max(1, b.height));
    refreshSidebar();
    refreshInspector();
  });

  resources.listen(searchInput, "input", () => {
    filterQuery = searchInput.value;
    refreshSidebar();
  });

  resources.listen(canvasModeBtn, "click", () => {
    viewMode = "canvas";
    applyViewMode();
  });

  resources.listen(previewModeBtn, "click", () => {
    viewMode = "preview";
    applyViewMode();
  });

  resources.listen(toggleLayersBtn, "click", () => {
    sidebar.hidden = !sidebar.hidden;
    toggleLayersBtn.setAttribute("aria-pressed", String(!sidebar.hidden));
  });

  resources.listen(toggleInspectorBtn, "click", () => {
    inspector.hidden = !inspector.hidden;
    toggleInspectorBtn.setAttribute("aria-pressed", String(!inspector.hidden));
  });

  let pointerDownPos: { x: number; y: number } | null = null;
  resources.listen(viewportEl, "pointerdown", (e) => {
    const pe = e as PointerEvent;
    pointerDownPos = { x: pe.clientX, y: pe.clientY };
  });
  resources.listen(viewportEl, "pointerup", (e) => {
    const pe = e as PointerEvent;
    if (!pointerDownPos) return;
    const dx = Math.abs(pe.clientX - pointerDownPos.x);
    const dy = Math.abs(pe.clientY - pointerDownPos.y);
    pointerDownPos = null;
    if (dx > 4 || dy > 4) return;
    const rect = viewportEl.getBoundingClientRect();
    const localX = pe.clientX - rect.left;
    const localY = pe.clientY - rect.top;
    const bounds = getActiveContentBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const worldX = (localX - rect.width / 2 - currentTransform.panX) / currentTransform.scale + cx;
    const worldY = (localY - rect.height / 2 - currentTransform.panY) / currentTransform.scale + cy;
    const hit = hitTestDesignNode(getActiveRoots(), worldX, worldY);
    selectedNodeId = hit?.id;
    refreshSidebar();
    refreshInspector();
    surface.schedule();
  });

  let disposed = false;
  if (doc.images.size > 0 && typeof createImageBitmap === "function") {
    void (async () => {
      for (const [ref, imgBytes] of doc.images.entries()) {
        if (disposed || signal.aborted) return;
        try {
          const bitmap = await createImageBitmap(new Blob([imgBytes as BlobPart]));
          if (disposed || signal.aborted) {
            bitmap.close();
            return;
          }
          decodedImages.set(ref, bitmap);
          surface.schedule();
        } catch {
          // Ignore undecodable embedded image
        }
      }
    })();
  }

  applyViewMode();
  refreshSidebar();
  refreshInspector();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    resources.dispose();
    for (const url of objectUrls.splice(0)) {
      URL.revokeObjectURL(url);
    }
    for (const img of decodedImages.values()) {
      if ("close" in img && typeof img.close === "function") {
        img.close();
      }
    }
    decodedImages.clear();
    root.remove();
  };

  resources.listen(signal, "abort", () => dispose(), { once: true });

  return { root, dispose };
}
