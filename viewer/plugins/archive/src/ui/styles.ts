export const archiveViewerStyles = `
  .anyfile-archive-viewer { box-sizing:border-box; min-height:100%; width:100%; padding:20px; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-archive-viewer * { box-sizing:border-box; }
  .anyfile-archive-viewer__header { display:flex; flex-wrap:wrap; align-items:flex-start; gap:12px; margin-bottom:16px; }
  .anyfile-archive-viewer__title { min-width:0; margin:0 auto 0 0; }
  .anyfile-archive-viewer__title strong { display:block; max-width:min(620px,80vw); overflow:hidden; font-size:18px; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-archive-viewer__title span, .anyfile-archive-viewer__muted { color:#64748b; font-size:12px; }
  .anyfile-archive-viewer__kind { border:1px solid var(--viewer-border,#ddd); border-radius:999px; padding:4px 9px; color:var(--viewer-accent,#2563eb); font-size:12px; }
  .anyfile-archive-viewer__section { margin:0 0 18px; }
  .anyfile-archive-viewer__section h2 { margin:0 0 9px; font-size:14px; }
  .anyfile-archive-viewer__fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:1px; overflow:hidden; border:1px solid var(--viewer-border,#ddd); border-radius:9px; background:var(--viewer-border,#ddd); }
  .anyfile-archive-viewer__field { min-width:0; margin:0; padding:10px 12px; background:var(--viewer-background,#fff); }
  .anyfile-archive-viewer__field dt { margin-bottom:3px; color:#64748b; font-size:11px; }
  .anyfile-archive-viewer__field dd { margin:0; overflow-wrap:anywhere; font-size:13px; }
  .anyfile-archive-viewer__notice { border-left:3px solid #d97706; border-radius:4px; padding:10px 12px; background:#fffbeb; color:#78350f; font-size:13px; }
  .anyfile-archive-viewer__controls { position:sticky; top:0; z-index:4; display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:9px 0; background:var(--viewer-background,#fff); }
  .anyfile-archive-viewer__controls input { min-width:180px; flex:1; height:34px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:inherit; color:inherit; padding:0 10px; font:inherit; }
  .anyfile-archive-viewer__controls button { height:34px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:inherit; color:inherit; padding:0 11px; font:inherit; }
  .anyfile-archive-viewer__controls button:not(:disabled) { cursor:pointer; }
  .anyfile-archive-viewer__controls button:disabled { opacity:.45; }
  .anyfile-archive-viewer__table { min-width:920px; width:100%; border-collapse:separate; border-spacing:0; border-top:1px solid var(--viewer-border,#ddd); border-left:1px solid var(--viewer-border,#ddd); font-size:12px; }
  .anyfile-archive-viewer__table th, .anyfile-archive-viewer__table td { border-right:1px solid var(--viewer-border,#ddd); border-bottom:1px solid var(--viewer-border,#ddd); padding:7px 9px; text-align:left; vertical-align:top; }
  .anyfile-archive-viewer__table thead th { position:sticky; top:52px; z-index:3; background:#f1f5f9; white-space:nowrap; }
  .anyfile-archive-viewer__path { max-width:420px; overflow-wrap:anywhere; }
  .anyfile-archive-viewer__entry-meta { display:block; margin-top:3px; color:#64748b; font-size:10px; }
  .anyfile-archive-viewer__badge { display:inline-block; margin:2px 4px 0 0; border-radius:999px; padding:1px 5px; background:#fee2e2; color:#991b1b; font-size:10px; }
  .anyfile-archive-viewer__empty { padding:24px; border:1px dashed var(--viewer-border,#ddd); border-radius:8px; color:#64748b; text-align:center; }
  @media (max-width:640px) { .anyfile-archive-viewer { padding:12px; } .anyfile-archive-viewer__table thead th { top:92px; } }
`;
