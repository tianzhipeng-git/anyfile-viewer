import { viewerTheme as t } from "./tokens";

export const inspectorStyles = `
  .anyfile-inspector {
    box-sizing: border-box;
    container-type: inline-size;
    display: flex;
    height: 100%;
    min-height: 0;
    width: 100%;
    flex-direction: column;
    overflow: hidden;
    background: ${t.background};
    color: ${t.foreground};
    font: 13px/1.45 ${t.fontFamily};
  }
  .anyfile-inspector *, .anyfile-inspector *::before, .anyfile-inspector *::after {
    box-sizing: border-box;
  }
  .anyfile-inspector__header {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    padding: 12px 16px;
    border-bottom: 1px solid ${t.border};
    background: ${t.background};
  }
  .anyfile-inspector__identity {
    min-width: 0;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .anyfile-inspector__title {
    margin: 0;
    min-width: 0;
    max-width: min(560px, 75cqi);
    overflow: hidden;
    font-size: 15px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .anyfile-inspector__subtitle {
    color: ${t.muted};
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .anyfile-inspector__stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
  }
  .anyfile-inspector__stats:empty,
  .anyfile-inspector__badges:empty,
  .anyfile-inspector__toolbar:empty {
    display: none;
  }
  .anyfile-inspector__stat {
    color: ${t.muted};
    font-size: 12px;
    white-space: nowrap;
  }
  .anyfile-inspector__badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .anyfile-inspector__toolbar {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-bottom: 1px solid ${t.border};
    background: color-mix(in srgb, ${t.surface} 55%, ${t.background});
  }
  .anyfile-inspector__body {
    min-height: 0;
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .anyfile-inspector__body--split {
    display: grid;
    grid-template-columns: minmax(280px, 0.85fr) minmax(360px, 1.15fr);
    overflow: hidden;
  }
  .anyfile-inspector__sidebar {
    min-height: 0;
    min-width: 0;
    overflow: auto;
    padding: 14px 18px 22px;
    border-inline-end: 1px solid ${t.border};
  }
  .anyfile-inspector__viewport {
    min-height: 0;
    min-width: 0;
    flex: 1;
    overflow: auto;
    padding: 14px 18px 24px;
  }
  .anyfile-inspector__body--split > .anyfile-inspector__viewport {
    padding: 0;
  }
  .anyfile-inspector__section {
    margin: 0 0 18px;
  }
  .anyfile-inspector__section:last-child {
    margin-bottom: 0;
  }
  .anyfile-inspector__heading {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 650;
  }
  .anyfile-inspector__kv {
    margin: 0 0 14px;
  }
  .anyfile-inspector__kv--list {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 6px 14px;
  }
  .anyfile-inspector__kv--list dt {
    color: ${t.muted};
  }
  .anyfile-inspector__kv--list dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .anyfile-inspector__kv--cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1px;
    overflow: hidden;
    border: 1px solid ${t.border};
    border-radius: 8px;
    background: ${t.border};
  }
  .anyfile-inspector__kv-item {
    min-width: 0;
    padding: 9px 12px;
    background: ${t.background};
  }
  .anyfile-inspector__kv-item dt {
    color: ${t.muted};
    font-size: 11px;
  }
  .anyfile-inspector__kv-item dd {
    margin: 3px 0 0;
    min-width: 0;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .anyfile-inspector__table-wrap {
    max-inline-size: 100%;
    overflow-x: auto;
  }
  .anyfile-inspector__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .anyfile-inspector__table th,
  .anyfile-inspector__table td {
    padding: 7px 10px;
    border-bottom: 1px solid color-mix(in srgb, ${t.border} 78%, transparent);
    text-align: start;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .anyfile-inspector__table th {
    font-weight: 600;
    background: ${t.surface};
    color: ${t.foreground};
  }
  .anyfile-inspector__table--sticky thead th {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .anyfile-inspector__table--bordered th,
  .anyfile-inspector__table--bordered td {
    border: 1px solid ${t.border};
  }
  .anyfile-inspector__table th:has(> .anyfile-inspector__sort-btn) {
    padding: 0;
  }
  .anyfile-inspector__sort-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-height: 30px;
    padding: 7px 10px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: inherit;
    text-align: inherit;
    cursor: pointer;
  }
  .anyfile-inspector__col--end .anyfile-inspector__sort-btn {
    justify-content: flex-end;
  }
  .anyfile-inspector__table th[aria-sort="ascending"] .anyfile-inspector__sort-btn::after {
    content: "▲";
    font-size: 10px;
    opacity: 0.8;
  }
  .anyfile-inspector__table th[aria-sort="descending"] .anyfile-inspector__sort-btn::after {
    content: "▼";
    font-size: 10px;
    opacity: 0.8;
  }
  .anyfile-inspector__col--end {
    text-align: end !important;
    font-variant-numeric: tabular-nums;
  }
  .anyfile-inspector__col--nowrap {
    white-space: nowrap;
  }
  .anyfile-inspector__row--interactive {
    cursor: pointer;
  }
  .anyfile-inspector__row--interactive:hover,
  .anyfile-inspector__row--selected {
    background: color-mix(in srgb, ${t.accent} 10%, transparent);
  }
  .anyfile-inspector__mono {
    font-family: ${t.fontMono};
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .anyfile-inspector__muted,
  .anyfile-inspector__empty,
  .anyfile-inspector__note {
    color: ${t.muted};
  }
  .anyfile-inspector__empty {
    padding: 28px 12px;
    text-align: center;
  }
  .anyfile-inspector__note {
    padding: 9px 10px;
    font-size: 12px;
  }
  .anyfile-inspector__filter {
    min-width: 180px;
    flex: 1 1 200px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid ${t.border};
    border-radius: 6px;
    background: ${t.background};
    color: inherit;
    font: inherit;
  }
  .anyfile-inspector__btn,
  .anyfile-inspector__select,
  .anyfile-inspector__tab {
    height: 30px;
    padding: 0 10px;
    border: 1px solid ${t.border};
    border-radius: 6px;
    background: ${t.background};
    color: inherit;
    font: inherit;
    font-size: 12px;
  }
  .anyfile-inspector__btn:not(:disabled),
  .anyfile-inspector__select:not(:disabled),
  .anyfile-inspector__tab:not(:disabled) {
    cursor: pointer;
  }
  .anyfile-inspector__btn:disabled,
  .anyfile-inspector__select:disabled,
  .anyfile-inspector__tab:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .anyfile-inspector__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .anyfile-inspector__tab {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .anyfile-inspector__tab[aria-pressed="true"] {
    border-color: ${t.accent};
    background: color-mix(in srgb, ${t.accent} 14%, transparent);
    font-weight: 600;
  }
  .anyfile-inspector__pager {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .anyfile-inspector__pager-meta {
    color: ${t.muted};
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .anyfile-inspector__notice {
    margin: 0 0 12px;
    padding: 9px 12px;
    border-inline-start: 3px solid ${t.accent};
    border-radius: 4px;
    background: color-mix(in srgb, ${t.accent} 10%, transparent);
    color: ${t.foreground};
    font-size: 12px;
  }
  .anyfile-inspector__notice--warning {
    border-inline-start-color: ${t.warning};
    background: color-mix(in srgb, ${t.warning} 13%, transparent);
  }
  .anyfile-inspector__notice--danger {
    border-inline-start-color: ${t.danger};
    background: color-mix(in srgb, ${t.danger} 13%, transparent);
  }
  .anyfile-inspector__notice--success {
    border-inline-start-color: ${t.success};
    background: color-mix(in srgb, ${t.success} 13%, transparent);
  }
  .anyfile-inspector__badge {
    display: inline-flex;
    align-items: center;
    flex: none;
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px solid ${t.border};
    background: ${t.surface};
    color: ${t.foreground};
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .anyfile-inspector__badge--accent {
    border-color: color-mix(in srgb, ${t.accent} 45%, transparent);
    background: color-mix(in srgb, ${t.accent} 12%, transparent);
    color: color-mix(in srgb, ${t.accent} 82%, ${t.foreground});
  }
  .anyfile-inspector__badge--success {
    border-color: color-mix(in srgb, ${t.success} 45%, transparent);
    background: color-mix(in srgb, ${t.success} 13%, transparent);
    color: color-mix(in srgb, ${t.success} 78%, ${t.foreground});
  }
  .anyfile-inspector__badge--warning {
    border-color: color-mix(in srgb, ${t.warning} 45%, transparent);
    background: color-mix(in srgb, ${t.warning} 14%, transparent);
    color: color-mix(in srgb, ${t.warning} 78%, ${t.foreground});
  }
  .anyfile-inspector__badge--danger {
    border-color: color-mix(in srgb, ${t.danger} 45%, transparent);
    background: color-mix(in srgb, ${t.danger} 14%, transparent);
    color: color-mix(in srgb, ${t.danger} 78%, ${t.foreground});
  }
  .anyfile-inspector__code {
    max-height: 280px;
    overflow: auto;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid ${t.border};
    border-radius: 6px;
    background: ${t.surface};
    font: 12px/1.5 ${t.fontMono};
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .anyfile-inspector :is(button, input, select, [tabindex="0"]):focus-visible {
    outline: 2px solid ${t.accent};
    outline-offset: 2px;
  }
  @container (max-width: 720px) {
    .anyfile-inspector__body--split {
      display: flex;
      flex-direction: column;
      overflow: auto;
    }
    .anyfile-inspector__body--split > .anyfile-inspector__sidebar,
    .anyfile-inspector__body--split > .anyfile-inspector__viewport {
      flex: none;
      overflow: visible;
      border-inline-end: 0;
    }
    .anyfile-inspector__body--split > .anyfile-inspector__sidebar {
      border-bottom: 1px solid ${t.border};
    }
  }
  @container (max-width: 560px) {
    .anyfile-inspector__header,
    .anyfile-inspector__toolbar {
      padding-inline: 12px;
    }
    .anyfile-inspector__viewport,
    .anyfile-inspector__sidebar {
      padding-inline: 12px;
    }
  }
`;
