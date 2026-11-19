import type { LegacyBlock, LegacyMetadata, LegacyRun } from "./model";
import { sanitizeHref } from "./model";

export const VIEWER_STYLES = `
.anyfile-legacy-office-viewer {
  box-sizing: border-box;
  min-height: 100%;
  width: 100%;
  background: color-mix(in srgb, var(--viewer-background, #f3f4f6) 92%, var(--viewer-foreground, #111827) 8%);
  color: var(--viewer-foreground, #111827);
  font-family: var(--viewer-font-family, system-ui, -apple-system, sans-serif);
}
.anyfile-legacy-office__toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--viewer-border, #d1d5db);
  background: var(--viewer-background, #ffffff);
}
.anyfile-legacy-office__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 36ch;
}
.anyfile-legacy-office__badge {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--viewer-border, #d1d5db);
  text-transform: uppercase;
}
.anyfile-legacy-office__spacer { flex: 1; min-width: 8px; }
.anyfile-legacy-office__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.anyfile-legacy-office__btn,
.anyfile-legacy-office__select {
  font: inherit;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--viewer-border, #d1d5db);
  background: var(--viewer-background, #ffffff);
  color: var(--viewer-foreground, #111827);
  cursor: pointer;
}
.anyfile-legacy-office__btn:disabled { opacity: 0.45; cursor: not-allowed; }
.anyfile-legacy-office__btn[aria-pressed="true"] {
  border-color: var(--viewer-accent, #2563eb);
  color: var(--viewer-accent, #2563eb);
}
.anyfile-legacy-office__meta-panel {
  max-width: 860px;
  margin: 12px auto 0;
  padding: 12px 16px;
  border: 1px solid var(--viewer-border, #d1d5db);
  border-radius: 8px;
  background: var(--viewer-background, #ffffff);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 16px;
  font-size: 13px;
}
.anyfile-legacy-office__meta-item dt { opacity: 0.68; font-size: 11px; text-transform: uppercase; }
.anyfile-legacy-office__meta-item dd { margin: 2px 0 0; word-break: break-word; }
.anyfile-legacy-office__banner {
  max-width: 860px;
  margin: 12px auto 0;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--viewer-border, #d1d5db);
  background: var(--viewer-background, #ffffff);
  font-size: 13px;
}
.anyfile-legacy-office__body { padding: 20px 16px 40px; }
.anyfile-legacy-office__paper {
  box-sizing: border-box;
  max-width: 820px;
  margin: 0 auto;
  padding: 36px min(5vw, 48px);
  background: #ffffff;
  color: #111827;
  border: 1px solid var(--viewer-border, #d1d5db);
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.anyfile-legacy-office__paper h1,
.anyfile-legacy-office__paper h2,
.anyfile-legacy-office__paper h3,
.anyfile-legacy-office__paper h4,
.anyfile-legacy-office__paper h5,
.anyfile-legacy-office__paper h6 {
  margin: 1.1em 0 0.45em;
  line-height: 1.3;
}
.anyfile-legacy-office__paper p { margin: 0 0 0.75em; white-space: pre-wrap; }
.anyfile-legacy-office__list-item { margin: 0 0 0.45em; padding-left: 1.25em; position: relative; }
.anyfile-legacy-office__list-item::before { content: "•"; position: absolute; left: 0.35em; }
.anyfile-legacy-office__table-wrap { overflow-x: auto; margin: 12px 0; max-width: 100%; }
.anyfile-legacy-office__table { border-collapse: collapse; width: 100%; font-size: 0.94em; }
.anyfile-legacy-office__table td {
  border: 1px solid #d1d5db;
  padding: 6px 8px;
  vertical-align: top;
  white-space: pre-wrap;
}
.anyfile-legacy-office__img {
  display: inline-block;
  max-width: 100%;
  height: auto;
  margin: 6px 0;
  border-radius: 3px;
}
.anyfile-legacy-office__page-break { border: 0; border-top: 1px dashed #9ca3af; margin: 24px 0; }
.anyfile-legacy-office__footnotes {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid #d1d5db;
  font-size: 0.9em;
}
.anyfile-legacy-office__slides {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.anyfile-legacy-office__slide-card {
  background: #ffffff;
  color: #111827;
  border: 1px solid var(--viewer-border, #d1d5db);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.anyfile-legacy-office__slide-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}
.anyfile-legacy-office__slide-stage { position: relative; width: 100%; background: #ffffff; overflow: hidden; }
.anyfile-legacy-office__slide-shape {
  position: absolute;
  box-sizing: border-box;
  overflow: auto;
  padding: 4px 6px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.anyfile-legacy-office__slide-shape p,
.anyfile-legacy-office__slide-shape h2 { margin: 0 0 0.35em; white-space: pre-wrap; }
.anyfile-legacy-office__slide-fallback { padding: 20px 24px; line-height: 1.5; overflow-wrap: anywhere; }
.anyfile-legacy-office__slide-notes {
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
  font-size: 13px;
}
.anyfile-legacy-office__empty { text-align: center; padding: 48px 16px; opacity: 0.75; }
`;

export function appendStyledRuns(
  parent: HTMLElement,
  runs: readonly LegacyRun[],
  imageUrls: readonly string[],
  imageAlt: string,
  scaleFactor = 1,
) {
  for (const run of runs) {
    if (run.imageIndex !== undefined) {
      const url = imageUrls[run.imageIndex];
      if (url) {
        const img = document.createElement("img");
        img.className = "anyfile-legacy-office__img";
        img.src = url;
        img.alt = imageAlt;
        parent.append(img);
      }
      continue;
    }
    if (!run.text) continue;
    let node: HTMLElement | Text = document.createTextNode(run.text);
    if (
      run.bold ||
      run.italic ||
      run.underline ||
      run.strike ||
      run.superscript ||
      run.subscript ||
      run.fontSizePt ||
      run.color ||
      run.backgroundColor ||
      run.href
    ) {
      const safeHref = sanitizeHref(run.href);
      const el = safeHref ? document.createElement("a") : document.createElement("span");
      if (safeHref && el instanceof HTMLAnchorElement) {
        el.href = safeHref;
        el.target = "_blank";
        el.rel = "noreferrer noopener";
      }
      if (run.bold) el.style.fontWeight = "700";
      if (run.italic) el.style.fontStyle = "italic";
      const decorations: string[] = [];
      if (run.underline) decorations.push("underline");
      if (run.strike) decorations.push("line-through");
      if (decorations.length > 0) el.style.textDecoration = decorations.join(" ");
      if (run.superscript) el.style.verticalAlign = "super";
      else if (run.subscript) el.style.verticalAlign = "sub";
      if (run.superscript || run.subscript) el.style.fontSize = "0.78em";
      else if (run.fontSizePt) el.style.fontSize = `${(run.fontSizePt * scaleFactor).toFixed(1)}pt`;
      if (run.color) el.style.color = run.color;
      if (run.backgroundColor) el.style.backgroundColor = run.backgroundColor;
      el.textContent = run.text;
      node = el;
    }
    parent.append(node);
  }
}

export function renderBlocks(
  target: HTMLElement,
  blocks: readonly LegacyBlock[],
  imageUrls: readonly string[],
  labels: { embeddedImage: string; pageBreak: string },
  headingTargets?: Array<{ id: string; label: string }>,
  scaleFactor = 1,
) {
  for (const block of blocks) {
    if (block.kind === "page-break") {
      const hr = document.createElement("hr");
      hr.className = "anyfile-legacy-office__page-break";
      hr.setAttribute("aria-label", labels.pageBreak);
      target.append(hr);
      continue;
    }
    if (block.kind === "table") {
      const wrap = document.createElement("div");
      wrap.className = "anyfile-legacy-office__table-wrap";
      const table = document.createElement("table");
      table.className = "anyfile-legacy-office__table";
      const tbody = document.createElement("tbody");
      for (const row of block.rows) {
        const tr = document.createElement("tr");
        for (const cell of row) {
          const td = document.createElement("td");
          appendStyledRuns(td, cell, imageUrls, labels.embeddedImage, scaleFactor);
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(tbody);
      wrap.append(table);
      target.append(wrap);
      continue;
    }
    if (block.kind === "heading") {
      const h = document.createElement(`h${block.level}`);
      if (block.align) h.style.textAlign = block.align;
      appendStyledRuns(h, block.runs, imageUrls, labels.embeddedImage, scaleFactor);
      const label = h.textContent?.trim();
      if (headingTargets && label) {
        const id = `legacy-heading-${headingTargets.length + 1}`;
        h.id = id;
        headingTargets.push({ id, label: label.slice(0, 60) });
      }
      target.append(h);
      continue;
    }
    const p = document.createElement("p");
    if (block.align) p.style.textAlign = block.align;
    if (block.listLevel !== undefined) {
      p.className = "anyfile-legacy-office__list-item";
      p.style.marginLeft = `${block.listLevel * 20}px`;
    }
    appendStyledRuns(p, block.runs, imageUrls, labels.embeddedImage, scaleFactor);
    target.append(p);
  }
}

export function buildMetadataPanel(
  metadata: LegacyMetadata,
  labels: Record<"title" | "author" | "subject" | "company" | "keywords" | "created" | "modified", string>,
): HTMLElement | undefined {
  const fields: Array<[string, string | undefined]> = [
    [labels.title, metadata.title],
    [labels.author, metadata.author],
    [labels.subject, metadata.subject],
    [labels.company, metadata.company],
    [labels.keywords, metadata.keywords],
    [labels.created, metadata.created],
    [labels.modified, metadata.modified],
  ];
  const present = fields.filter(([, value]) => Boolean(value));
  if (present.length === 0) return undefined;
  const dl = document.createElement("dl");
  dl.className = "anyfile-legacy-office__meta-panel";
  dl.hidden = true;
  for (const [label, value] of present) {
    const item = document.createElement("div");
    item.className = "anyfile-legacy-office__meta-item";
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value!;
    item.append(dt, dd);
    dl.append(item);
  }
  return dl;
}
