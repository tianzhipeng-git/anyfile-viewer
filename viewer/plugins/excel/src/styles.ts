export const excelViewerStyles = `
  .anyfile-excel-viewer { display:flex; min-height:100%; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-excel-viewer__toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--viewer-border,#ddd); font-size:13px; }
  .anyfile-excel-viewer__name { min-width:120px; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:auto; }
  .anyfile-excel-viewer select, .anyfile-excel-viewer button { height:32px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 10px; font:inherit; }
  .anyfile-excel-viewer button:not(:disabled) { cursor:pointer; }
  .anyfile-excel-viewer button:disabled { cursor:not-allowed; opacity:.45; }
  .anyfile-excel-viewer__meta { color:#6b7280; white-space:nowrap; }
  .anyfile-excel-viewer__viewport { min-height:560px; flex:1; overflow:auto; background:#f8fafc; }
  .anyfile-excel-viewer table { min-width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; background:var(--viewer-background,#fff); font-size:12px; }
  .anyfile-excel-viewer th, .anyfile-excel-viewer td { height:28px; min-width:96px; max-width:320px; overflow:hidden; border-right:1px solid var(--viewer-border,#ddd); border-bottom:1px solid var(--viewer-border,#ddd); padding:4px 7px; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-excel-viewer thead th { position:sticky; top:0; z-index:2; background:#f1f5f9; text-align:center; color:#64748b; font-weight:600; }
  .anyfile-excel-viewer .anyfile-excel-viewer__row-number { position:sticky; left:0; z-index:1; min-width:56px; width:56px; background:#f1f5f9; color:#64748b; text-align:right; font-variant-numeric:tabular-nums; }
  .anyfile-excel-viewer thead .anyfile-excel-viewer__row-number { z-index:3; }
  .anyfile-excel-viewer__empty { display:grid; min-height:560px; place-items:center; color:#6b7280; }
`;
