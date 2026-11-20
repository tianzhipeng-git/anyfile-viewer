export const nativeBinaryStyles = `
  .anyfile-native-binary-viewer {
    box-sizing: border-box;
    display: flex;
    height: 100%;
    min-height: 0;
    width: 100%;
    flex-direction: column;
    overflow: hidden;
    background: var(--viewer-background, #fff);
    color: var(--viewer-foreground, #111);
    font-family: var(--viewer-font-family, system-ui, sans-serif);
  }
  .anyfile-native-binary-viewer * {
    box-sizing: border-box;
  }
  .anyfile-native-binary-viewer__header {
    flex: none;
    padding: 14px 18px 10px;
    border-bottom: 1px solid var(--viewer-border, #ddd);
  }
  .anyfile-native-binary-viewer__title {
    display: block;
    overflow: hidden;
    font-size: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .anyfile-native-binary-viewer__banner {
    display: block;
    margin-top: 3px;
    color: color-mix(in srgb, var(--viewer-foreground, #111) 66%, transparent);
    font-size: 12px;
  }
  .anyfile-native-binary-viewer__toolbar {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 9px 18px;
    border-bottom: 1px solid var(--viewer-border, #ddd);
    background: color-mix(in srgb, var(--viewer-foreground, #111) 2%, transparent);
  }
  .anyfile-native-binary-viewer__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .anyfile-native-binary-viewer__tab,
  .anyfile-native-binary-viewer__more {
    border: 1px solid var(--viewer-border, #ccc);
    border-radius: 6px;
    padding: 4px 10px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .anyfile-native-binary-viewer__tab[aria-pressed="true"] {
    border-color: var(--viewer-accent, #2563eb);
    background: color-mix(in srgb, var(--viewer-accent, #2563eb) 14%, transparent);
    font-weight: 600;
  }
  .anyfile-native-binary-viewer__select,
  .anyfile-native-binary-viewer__search {
    border: 1px solid var(--viewer-border, #ccc);
    border-radius: 6px;
    padding: 4px 9px;
    background: var(--viewer-background, #fff);
    color: inherit;
    font: inherit;
    font-size: 12px;
    min-width: 0;
  }
  .anyfile-native-binary-viewer__search {
    margin-left: auto;
    width: 220px;
    max-width: 100%;
  }
  .anyfile-native-binary-viewer__viewport {
    min-height: 0;
    min-width: 0;
    flex: 1;
    overflow: auto;
    padding: 14px 18px 22px;
  }
  .anyfile-native-binary-viewer__summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    margin: 0 0 14px;
    border: 1px solid var(--viewer-border, #ddd);
    border-radius: 8px;
  }
  .anyfile-native-binary-viewer__summary div {
    padding: 9px 12px;
    min-width: 0;
  }
  .anyfile-native-binary-viewer__summary dt {
    color: color-mix(in srgb, var(--viewer-foreground, #111) 64%, transparent);
    font-size: 11px;
  }
  .anyfile-native-binary-viewer__summary dd {
    margin: 3px 0 0;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .anyfile-native-binary-viewer__notice {
    margin: 0 0 12px;
    padding: 8px 12px;
    border-left: 3px solid var(--viewer-accent, #2563eb);
    background: color-mix(in srgb, var(--viewer-accent, #2563eb) 8%, transparent);
    font-size: 12px;
  }
  .anyfile-native-binary-viewer h2 {
    margin: 18px 0 8px;
    font-size: 14px;
  }
  .anyfile-native-binary-viewer__table-wrap {
    overflow-x: auto;
    max-width: 100%;
  }
  .anyfile-native-binary-viewer table {
    min-width: 520px;
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .anyfile-native-binary-viewer th,
  .anyfile-native-binary-viewer td {
    border: 1px solid var(--viewer-border, #ddd);
    padding: 6px 9px;
    overflow-wrap: anywhere;
    text-align: left;
    vertical-align: top;
  }
  .anyfile-native-binary-viewer th {
    background: color-mix(in srgb, var(--viewer-foreground, #111) 6%, transparent);
    white-space: nowrap;
  }
  .anyfile-native-binary-viewer__mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .anyfile-native-binary-viewer__empty {
    color: color-mix(in srgb, var(--viewer-foreground, #111) 64%, transparent);
    font-size: 12px;
    margin: 4px 0 8px;
  }
  .anyfile-native-binary-viewer__more {
    margin-top: 8px;
  }
  @media (max-width: 640px) {
    .anyfile-native-binary-viewer__header,
    .anyfile-native-binary-viewer__toolbar,
    .anyfile-native-binary-viewer__viewport {
      padding-left: 12px;
      padding-right: 12px;
    }
    .anyfile-native-binary-viewer__search {
      margin-left: 0;
      width: 100%;
    }
  }
`;
