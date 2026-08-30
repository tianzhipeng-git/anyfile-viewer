export const arrayViewerStyles = `
  .anyfile-array-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-array-viewer * { box-sizing:border-box; }
  .anyfile-array-viewer__header { display:flex; flex:none; align-items:baseline; gap:12px; padding:16px 18px 8px; }
  .anyfile-array-viewer__header strong { max-width:min(620px,70vw); overflow:hidden; font-size:18px; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-array-viewer__header span, .anyfile-array-viewer__muted { color:#64748b; font-size:12px; }
  .anyfile-array-viewer__controls { display:flex; flex:none; flex-wrap:wrap; align-items:end; gap:8px; padding:8px 18px; border-bottom:1px solid var(--viewer-border,#ddd); }
  .anyfile-array-viewer__controls label { display:grid; gap:3px; min-width:min(320px,100%); color:#64748b; font-size:11px; }
  .anyfile-array-viewer__controls select, .anyfile-array-viewer__controls button { height:34px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 10px; font:inherit; }
  .anyfile-array-viewer__controls button:not(:disabled) { cursor:pointer; }
  .anyfile-array-viewer__controls button:disabled { opacity:.45; }
  .anyfile-array-viewer__metadata { display:grid; flex:none; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); margin:0; border-bottom:1px solid var(--viewer-border,#ddd); }
  .anyfile-array-viewer__metadata div { min-width:0; padding:8px 18px; }
  .anyfile-array-viewer__metadata dt { color:#64748b; font-size:11px; }
  .anyfile-array-viewer__metadata dd { margin:3px 0 0; overflow-wrap:anywhere; font-size:13px; }
  .anyfile-array-viewer__notice { flex:none; margin:10px 18px 0; border-left:3px solid #d97706; border-radius:4px; padding:9px 11px; background:#fffbeb; color:#78350f; font-size:13px; }
  .anyfile-array-viewer__viewport { min-height:0; flex:1; overflow:auto; padding:12px 18px 18px; }
  .anyfile-array-viewer__status { padding:22px; color:#64748b; text-align:center; }
  .anyfile-array-viewer__table { min-width:560px; width:100%; border-collapse:separate; border-spacing:0; border-top:1px solid var(--viewer-border,#ddd); border-left:1px solid var(--viewer-border,#ddd); font-size:12px; }
  .anyfile-array-viewer__table th, .anyfile-array-viewer__table td { max-width:420px; border-right:1px solid var(--viewer-border,#ddd); border-bottom:1px solid var(--viewer-border,#ddd); padding:7px 9px; overflow-wrap:anywhere; text-align:left; vertical-align:top; }
  .anyfile-array-viewer__table th { position:sticky; top:0; z-index:1; background:#f1f5f9; white-space:nowrap; }
  @media (max-width:640px) { .anyfile-array-viewer__header, .anyfile-array-viewer__controls { padding-left:12px; padding-right:12px; } .anyfile-array-viewer__viewport { padding:10px 12px 14px; } }
`;
