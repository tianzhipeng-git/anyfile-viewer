import { el } from "@anyfile/viewer-ui";
import type { DesignMessages } from "./i18n";
import { colorToCss, colorToHex, type DesignDocument, type DesignNode } from "./model";

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function buildCssSnippet(node: DesignNode): string {
  const lines: string[] = [
    `width: ${formatNumber(node.bounds.width)}px;`,
    `height: ${formatNumber(node.bounds.height)}px;`,
  ];
  if (node.opacity < 0.999) {
    lines.push(`opacity: ${Number(node.opacity.toFixed(2))};`);
  }
  if (node.cornerRadius > 0) {
    lines.push(`border-radius: ${formatNumber(node.cornerRadius)}px;`);
  }
  const firstFill = node.fills[0];
  if (firstFill?.type === "solid") {
    lines.push(
      node.kind === "text"
        ? `color: ${colorToHex(firstFill.color)};`
        : `background: ${colorToCss(firstFill.color, firstFill.opacity)};`,
    );
  }
  const firstStroke = node.strokes[0];
  if (firstStroke) {
    lines.push(`border: ${formatNumber(firstStroke.width)}px solid ${colorToCss(firstStroke.color, firstStroke.opacity)};`);
  }
  if (node.text) {
    if (node.text.fontFamily) lines.push(`font-family: "${node.text.fontFamily}";`);
    if (node.text.fontSize) lines.push(`font-size: ${formatNumber(node.text.fontSize)}px;`);
    if (node.text.lineHeight) lines.push(`line-height: ${formatNumber(node.text.lineHeight)}px;`);
    if (node.text.align) lines.push(`text-align: ${node.text.align};`);
  }
  return lines.join("\n");
}

function createCopyButton(label: string, copiedLabel: string, getText: () => string): HTMLButtonElement {
  const button = el("button", {
    className: "anyfile-design-source-viewer__button",
    attrs: { type: "button" },
    text: label,
  });
  button.addEventListener("click", () => {
    const value = getText();
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value).then(() => {
        button.textContent = copiedLabel;
        window.setTimeout(() => {
          button.textContent = label;
        }, 1200);
      });
    }
  });
  return button;
}

function kvRow(key: string, value: string): HTMLElement {
  return el(
    "div",
    { className: "anyfile-design-source-viewer__kv" },
    el("span", { className: "anyfile-design-source-viewer__kv-key", text: key }),
    el("span", { className: "anyfile-design-source-viewer__kv-val", text: value }),
  );
}

function metricBox(label: string, value: string): HTMLElement {
  return el(
    "div",
    { className: "anyfile-design-source-viewer__metric" },
    el("span", { className: "anyfile-design-source-viewer__metric-label", text: label }),
    el("span", { className: "anyfile-design-source-viewer__metric-value", text: value }),
  );
}

export function renderInspectorContent(
  container: HTMLElement,
  doc: DesignDocument,
  selected: DesignNode | undefined,
  messages: DesignMessages,
) {
  const sections: HTMLElement[] = [];

  if (selected) {
    const layerSection = el(
      "section",
      { className: "anyfile-design-source-viewer__section", dataset: { section: "layer" } },
      el("h3", { className: "anyfile-design-source-viewer__section-title", text: messages.selectionSection }),
      kvRow(messages.selectionSection, selected.name),
      kvRow(messages.typeLabel, selected.rawType),
      kvRow(messages.visibilityLabel, selected.visible ? messages.visibleYes : messages.visibleNo),
      kvRow(messages.opacityLabel, `${Math.round(selected.opacity * 100)}%`),
    );
    sections.push(layerSection);

    const geomGrid = el(
      "div",
      { className: "anyfile-design-source-viewer__grid" },
      metricBox("X", `${formatNumber(selected.bounds.x)} px`),
      metricBox("Y", `${formatNumber(selected.bounds.y)} px`),
      metricBox("W", `${formatNumber(selected.bounds.width)} px`),
      metricBox("H", `${formatNumber(selected.bounds.height)} px`),
    );
    const geomSection = el(
      "section",
      { className: "anyfile-design-source-viewer__section", dataset: { section: "geometry" } },
      el("h3", { className: "anyfile-design-source-viewer__section-title", text: messages.geometrySection }),
      geomGrid,
    );
    if (selected.rotation !== 0) {
      geomSection.append(kvRow(messages.rotationLabel, `${formatNumber(selected.rotation)}°`));
    }
    if (selected.cornerRadius > 0) {
      geomSection.append(kvRow(messages.cornerRadiusLabel, `${formatNumber(selected.cornerRadius)} px`));
    }
    geomSection.append(
      el(
        "div",
        { className: "anyfile-design-source-viewer__actions" },
        createCopyButton(messages.copyCss, messages.copied, () => buildCssSnippet(selected)),
      ),
    );
    sections.push(geomSection);

    if (selected.text) {
      const textInfo = selected.text;
      const typoSection = el(
        "section",
        { className: "anyfile-design-source-viewer__section", dataset: { section: "typography" } },
        el("h3", { className: "anyfile-design-source-viewer__section-title", text: messages.typographySection }),
      );
      if (textInfo.fontFamily) {
        const fontDesc = textInfo.fontStyle
          ? `${textInfo.fontFamily} (${textInfo.fontStyle})`
          : textInfo.fontFamily;
        typoSection.append(kvRow(messages.fontLabel, fontDesc));
      }
      if (textInfo.fontSize) {
        typoSection.append(kvRow(messages.fontSizeLabel, `${formatNumber(textInfo.fontSize)} px`));
      }
      if (textInfo.lineHeight) {
        typoSection.append(kvRow(messages.lineHeightLabel, `${formatNumber(textInfo.lineHeight)} px`));
      }
      if (textInfo.align) {
        typoSection.append(kvRow(messages.alignLabel, textInfo.align));
      }
      if (textInfo.color) {
        const swatch = el("span", { className: "anyfile-design-source-viewer__swatch" });
        swatch.style.background = colorToCss(textInfo.color);
        typoSection.append(
          el(
            "div",
            { className: "anyfile-design-source-viewer__swatch-row" },
            swatch,
            el("span", { text: colorToHex(textInfo.color) }),
          ),
        );
      }
      if (textInfo.content) {
        typoSection.append(
          el("div", {
            className: "anyfile-design-source-viewer__text-box",
            dataset: { textContentBox: "" },
            text: textInfo.content,
          }),
          el(
            "div",
            { className: "anyfile-design-source-viewer__actions" },
            createCopyButton(messages.copyText, messages.copied, () => textInfo.content),
          ),
        );
      }
      sections.push(typoSection);
    }

    const appSection = el(
      "section",
      { className: "anyfile-design-source-viewer__section", dataset: { section: "appearance" } },
      el("h3", { className: "anyfile-design-source-viewer__section-title", text: messages.appearanceSection }),
    );
    if (selected.fills.length === 0) {
      appSection.append(kvRow(messages.fillsLabel, messages.noFills));
    } else {
      for (const fill of selected.fills) {
        const swatch = el("span", { className: "anyfile-design-source-viewer__swatch" });
        let label = "";
        if (fill.type === "solid") {
          swatch.style.background = colorToCss(fill.color, fill.opacity);
          label = `${colorToHex(fill.color)} · ${Math.round(fill.opacity * 100)}%`;
        } else if (fill.type === "image") {
          swatch.style.background = "repeating-conic-gradient(#888 0% 25%, transparent 0% 50%) 50% / 8px 8px";
          label = `${messages.imageFill} (${fill.imageRef})`;
        } else {
          const first = fill.stops[0]?.color;
          const last = fill.stops[fill.stops.length - 1]?.color;
          if (first && last) {
            swatch.style.background = `linear-gradient(90deg, ${colorToCss(first)}, ${colorToCss(last)})`;
          }
          label = `${messages.gradientFill} (${fill.stops.length})`;
        }
        appSection.append(
          el("div", { className: "anyfile-design-source-viewer__swatch-row" }, swatch, el("span", { text: label })),
        );
      }
    }
    if (selected.strokes.length === 0) {
      appSection.append(kvRow(messages.strokesLabel, messages.noStrokes));
    } else {
      for (const stroke of selected.strokes) {
        const swatch = el("span", { className: "anyfile-design-source-viewer__swatch" });
        swatch.style.background = colorToCss(stroke.color, stroke.opacity);
        appSection.append(
          el(
            "div",
            { className: "anyfile-design-source-viewer__swatch-row" },
            swatch,
            el("span", { text: `${colorToHex(stroke.color)} · ${formatNumber(stroke.width)}px` }),
          ),
        );
      }
    }
    sections.push(appSection);
  }

  const docSection = el(
    "section",
    { className: "anyfile-design-source-viewer__section", dataset: { section: "document" } },
    el("h3", { className: "anyfile-design-source-viewer__section-title", text: messages.documentOverview }),
    kvRow(messages.formatLabel, doc.format === "figma" ? "Figma (.fig)" : "Sketch (.sketch)"),
    kvRow(messages.versionLabel, doc.version),
    kvRow(messages.pagesLabel, String(doc.stats.pageCount)),
    kvRow(messages.artboardsLabel, String(doc.stats.artboardCount)),
    kvRow(messages.layersLabel, String(doc.stats.nodeCount)),
    kvRow(messages.textLayersLabel, String(doc.stats.textNodeCount)),
    kvRow(messages.imagesLabel, String(doc.stats.imageCount)),
  );
  if (doc.exportedAt) {
    docSection.append(kvRow(messages.exportedAtLabel, doc.exportedAt.slice(0, 19).replace("T", " ")));
  }
  if (doc.fonts.length > 0) {
    docSection.append(kvRow(messages.fontsLabel, doc.fonts.slice(0, 12).join(", ")));
  }
  sections.push(docSection);

  container.replaceChildren(...sections);
}
