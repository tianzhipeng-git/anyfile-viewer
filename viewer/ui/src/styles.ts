export const tableViewerStyles = `
  .anyfile-table-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-table-viewer__toolbar { display:flex; flex:none; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--viewer-border,#ddd); font-size:13px; }
  .anyfile-table-viewer__name { min-width:120px; max-width:280px; margin-right:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-table-viewer select, .anyfile-table-viewer button { height:32px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 10px; font:inherit; }
  .anyfile-table-viewer button:not(:disabled), .anyfile-table-viewer select:not(:disabled) { cursor:pointer; }
  .anyfile-table-viewer button:disabled, .anyfile-table-viewer select:disabled { cursor:not-allowed; opacity:.45; }
  .anyfile-table-viewer__meta, .anyfile-table-viewer__type { color:#6b7280; }
  .anyfile-table-viewer__meta { white-space:nowrap; }
  .anyfile-table-viewer__viewport { min-height:0; flex:1; overflow:auto; background:#f8fafc; }
  .anyfile-table-viewer table { min-width:100%; border-collapse:separate; border-spacing:0; background:var(--viewer-background,#fff); font-size:12px; }
  .anyfile-table-viewer th, .anyfile-table-viewer td { box-sizing:border-box; height:32px; min-width:120px; max-width:420px; overflow:hidden; border-right:1px solid var(--viewer-border,#ddd); border-bottom:1px solid var(--viewer-border,#ddd); padding:5px 8px; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-table-viewer thead th { position:sticky; top:0; z-index:2; background:#f1f5f9; font-weight:600; }
  .anyfile-table-viewer__type { display:block; margin-top:1px; font-size:10px; font-weight:400; }
  .anyfile-table-viewer .anyfile-table-viewer__row-number { position:sticky; left:0; z-index:1; min-width:56px; width:56px; background:#f1f5f9; color:#64748b; text-align:right; font-variant-numeric:tabular-nums; }
  .anyfile-table-viewer thead .anyfile-table-viewer__row-number { z-index:3; }
  .anyfile-table-viewer__empty { display:grid; min-height:100%; place-items:center; padding:24px; color:#6b7280; text-align:center; }
`;
