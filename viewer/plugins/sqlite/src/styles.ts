export const sqliteViewerStyles = `
  .anyfile-sqlite-viewer { display:flex; min-height:100%; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-sqlite-viewer__toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--viewer-border,#ddd); font-size:13px; }
  .anyfile-sqlite-viewer__name { min-width:120px; max-width:280px; margin-right:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-sqlite-viewer select, .anyfile-sqlite-viewer button { height:32px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 10px; font:inherit; }
  .anyfile-sqlite-viewer button:not(:disabled), .anyfile-sqlite-viewer select { cursor:pointer; }
  .anyfile-sqlite-viewer button:disabled { cursor:not-allowed; opacity:.45; }
  .anyfile-sqlite-viewer__meta, .anyfile-sqlite-viewer__type { color:#6b7280; }
  .anyfile-sqlite-viewer__viewport { min-height:560px; flex:1; overflow:auto; background:#f8fafc; }
  .anyfile-sqlite-viewer table { min-width:100%; border-collapse:separate; border-spacing:0; background:var(--viewer-background,#fff); font-size:12px; }
  .anyfile-sqlite-viewer th, .anyfile-sqlite-viewer td { height:32px; min-width:120px; max-width:420px; overflow:hidden; border-right:1px solid var(--viewer-border,#ddd); border-bottom:1px solid var(--viewer-border,#ddd); padding:5px 8px; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-sqlite-viewer thead th { position:sticky; top:0; z-index:2; background:#f1f5f9; font-weight:600; }
  .anyfile-sqlite-viewer__type { display:block; margin-top:1px; font-size:10px; font-weight:400; }
  .anyfile-sqlite-viewer__row-number { position:sticky; left:0; z-index:1; min-width:56px !important; width:56px; background:#f1f5f9; color:#64748b; text-align:right !important; font-variant-numeric:tabular-nums; }
  .anyfile-sqlite-viewer thead .anyfile-sqlite-viewer__row-number { z-index:3; }
  .anyfile-sqlite-viewer__empty { display:grid; min-height:560px; place-items:center; color:#6b7280; }
`;
