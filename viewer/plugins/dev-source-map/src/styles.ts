export const sourceMapStyles = `
  .anyfile-source-map-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-source-map-viewer * { box-sizing:border-box; }
  .anyfile-source-map-viewer__header { flex:none; padding:16px 18px 10px; border-bottom:1px solid var(--viewer-border,#ddd); }
  .anyfile-source-map-viewer__header strong { display:block; overflow:hidden; font-size:18px; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-source-map-viewer__header span, .anyfile-source-map-viewer__muted { color:#64748b; font-size:12px; }
  .anyfile-source-map-viewer__viewport { min-height:0; flex:1; overflow:auto; padding:14px 18px 20px; }
  .anyfile-source-map-viewer__summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); margin:0 0 14px; border:1px solid var(--viewer-border,#ddd); border-radius:8px; }
  .anyfile-source-map-viewer__summary div { padding:9px 12px; }
  .anyfile-source-map-viewer__summary dt { color:#64748b; font-size:11px; }
  .anyfile-source-map-viewer__summary dd { margin:3px 0 0; font-size:13px; }
  .anyfile-source-map-viewer h2 { margin:18px 0 7px; font-size:14px; }
  .anyfile-source-map-viewer__query { display:flex; flex-wrap:wrap; align-items:end; gap:8px; padding:10px; border:1px solid var(--viewer-border,#ddd); border-radius:8px; }
  .anyfile-source-map-viewer__query label { display:grid; gap:3px; color:#64748b; font-size:11px; }
  .anyfile-source-map-viewer__query input, .anyfile-source-map-viewer__query button, .anyfile-source-map-viewer select { height:34px; border:1px solid var(--viewer-border,#ddd); border-radius:7px; background:var(--viewer-background,#fff); color:inherit; padding:0 9px; }
  .anyfile-source-map-viewer__query button { cursor:pointer; }
  .anyfile-source-map-viewer__result { min-width:220px; margin:0; overflow-wrap:anywhere; font-size:12px; }
  .anyfile-source-map-viewer table { min-width:620px; width:100%; border-collapse:collapse; font-size:12px; }
  .anyfile-source-map-viewer th, .anyfile-source-map-viewer td { border:1px solid var(--viewer-border,#ddd); padding:7px 9px; overflow-wrap:anywhere; text-align:left; vertical-align:top; }
  .anyfile-source-map-viewer th { background:#f1f5f9; white-space:nowrap; }
  .anyfile-source-map-viewer__warning { border-left:3px solid #d97706; padding:8px 10px; background:#fffbeb; color:#78350f; font-size:12px; }
  .anyfile-source-map-viewer__preview { max-height:320px; overflow:auto; border:1px solid var(--viewer-border,#ddd); border-radius:8px; padding:10px; background:#f8fafc; font:12px/1.5 ui-monospace,monospace; white-space:pre-wrap; }
  @media (max-width:640px) { .anyfile-source-map-viewer__header, .anyfile-source-map-viewer__viewport { padding-left:12px; padding-right:12px; } }
`;
