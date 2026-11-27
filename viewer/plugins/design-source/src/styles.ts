import { viewerTheme } from "@anyfile/viewer-ui";

export const designSourceStyles = `
.anyfile-design-source-viewer {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: ${viewerTheme.background};
  color: ${viewerTheme.foreground};
  font-family: ${viewerTheme.fontFamily};
  font-size: 13px;
}

.anyfile-design-source-viewer * {
  box-sizing: border-box;
}

.anyfile-design-source-viewer__toolbar {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${viewerTheme.surface};
  border-bottom: 1px solid ${viewerTheme.border};
}

.anyfile-design-source-viewer__title {
  font-weight: 600;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.anyfile-design-source-viewer__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in srgb, ${viewerTheme.accent} 14%, transparent);
  color: ${viewerTheme.accent};
}

.anyfile-design-source-viewer__spacer {
  flex: 1;
  min-width: 8px;
}

.anyfile-design-source-viewer__group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.anyfile-design-source-viewer__select,
.anyfile-design-source-viewer__button {
  height: 28px;
  padding: 0 9px;
  border-radius: 6px;
  border: 1px solid ${viewerTheme.border};
  background: ${viewerTheme.background};
  color: ${viewerTheme.foreground};
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.anyfile-design-source-viewer__button:hover:not(:disabled) {
  background: color-mix(in srgb, ${viewerTheme.foreground} 6%, ${viewerTheme.background});
}

.anyfile-design-source-viewer__button[aria-pressed="true"] {
  background: color-mix(in srgb, ${viewerTheme.accent} 14%, ${viewerTheme.background});
  border-color: ${viewerTheme.accent};
  color: ${viewerTheme.accent};
}

.anyfile-design-source-viewer__zoom-value {
  min-width: 44px;
  text-align: center;
  font-family: ${viewerTheme.fontMono};
  font-size: 12px;
  color: ${viewerTheme.muted};
}

.anyfile-design-source-viewer__body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  overflow: hidden;
}

.anyfile-design-source-viewer__sidebar,
.anyfile-design-source-viewer__inspector {
  flex: none;
  width: 260px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: ${viewerTheme.surface};
  overflow: hidden;
}

.anyfile-design-source-viewer__sidebar {
  border-right: 1px solid ${viewerTheme.border};
}

.anyfile-design-source-viewer__inspector {
  width: 280px;
  border-left: 1px solid ${viewerTheme.border};
}

.anyfile-design-source-viewer__sidebar[hidden],
.anyfile-design-source-viewer__inspector[hidden] {
  display: none;
}

.anyfile-design-source-viewer__panel-header {
  flex: none;
  padding: 8px 10px;
  border-bottom: 1px solid ${viewerTheme.border};
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.anyfile-design-source-viewer__panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${viewerTheme.muted};
}

.anyfile-design-source-viewer__search {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid ${viewerTheme.border};
  background: ${viewerTheme.background};
  color: ${viewerTheme.foreground};
  font-size: 12px;
}

.anyfile-design-source-viewer__panel-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}

.anyfile-design-source-viewer__artboard-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}

.anyfile-design-source-viewer__tree {
  list-style: none;
  margin: 0;
  padding: 0;
}

.anyfile-design-source-viewer__tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 4px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: ${viewerTheme.foreground};
  text-align: left;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.anyfile-design-source-viewer__tree-row:hover {
  background: color-mix(in srgb, ${viewerTheme.foreground} 6%, transparent);
}

.anyfile-design-source-viewer__tree-row[aria-selected="true"] {
  background: color-mix(in srgb, ${viewerTheme.accent} 16%, transparent);
  color: ${viewerTheme.accent};
  font-weight: 600;
}

.anyfile-design-source-viewer__tree-row[data-hidden-layer="true"] {
  opacity: 0.55;
}

.anyfile-design-source-viewer__kind-tag {
  flex: none;
  font-family: ${viewerTheme.fontMono};
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, ${viewerTheme.foreground} 8%, transparent);
  color: ${viewerTheme.muted};
}

.anyfile-design-source-viewer__tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.anyfile-design-source-viewer__stage {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, ${viewerTheme.foreground} 4%, ${viewerTheme.background});
}

.anyfile-design-source-viewer__viewport {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  cursor: grab;
  outline: none;
}

.anyfile-design-source-viewer__viewport[data-dragging="true"] {
  cursor: grabbing;
}

.anyfile-design-source-viewer__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.anyfile-design-source-viewer__preview-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 20px;
}

.anyfile-design-source-viewer__preview-wrap[hidden] {
  display: none;
}

.anyfile-design-source-viewer__preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.16);
}

.anyfile-design-source-viewer__section {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${viewerTheme.border};
}

.anyfile-design-source-viewer__section:last-child {
  border-bottom: none;
}

.anyfile-design-source-viewer__section-title {
  margin: 0 0 8px 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${viewerTheme.muted};
}

.anyfile-design-source-viewer__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.anyfile-design-source-viewer__metric {
  padding: 6px 8px;
  border-radius: 6px;
  background: ${viewerTheme.background};
  border: 1px solid ${viewerTheme.border};
}

.anyfile-design-source-viewer__metric-label {
  display: block;
  font-size: 10px;
  color: ${viewerTheme.muted};
}

.anyfile-design-source-viewer__metric-value {
  display: block;
  font-family: ${viewerTheme.fontMono};
  font-size: 12px;
  font-weight: 600;
  margin-top: 2px;
}

.anyfile-design-source-viewer__kv {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
}

.anyfile-design-source-viewer__kv-key {
  color: ${viewerTheme.muted};
  flex: none;
}

.anyfile-design-source-viewer__kv-val {
  font-family: ${viewerTheme.fontMono};
  text-align: right;
  word-break: break-word;
}

.anyfile-design-source-viewer__swatch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.anyfile-design-source-viewer__swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid ${viewerTheme.border};
  flex: none;
}

.anyfile-design-source-viewer__text-box {
  width: 100%;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid ${viewerTheme.border};
  background: ${viewerTheme.background};
  color: ${viewerTheme.foreground};
  font-family: ${viewerTheme.fontMono};
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow: auto;
  user-select: text;
}

.anyfile-design-source-viewer__actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.anyfile-design-source-viewer__empty {
  padding: 12px 6px;
  color: ${viewerTheme.muted};
  font-size: 12px;
}

@media (max-width: 820px) {
  .anyfile-design-source-viewer__sidebar,
  .anyfile-design-source-viewer__inspector {
    width: 210px;
  }
}
`;
