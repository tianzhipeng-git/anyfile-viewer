export const wasmStyles = `
  .anyfile-wasm-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
  .anyfile-wasm-viewer * { box-sizing:border-box; }
  .anyfile-wasm-viewer__header { flex:none; padding:16px 18px 10px; border-bottom:1px solid var(--viewer-border,#ddd); }
  .anyfile-wasm-viewer__header strong { display:block; overflow:hidden; font-size:18px; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-wasm-viewer__header span { color:#64748b; font-size:12px; }
  .anyfile-wasm-viewer__viewport { min-height:0; flex:1; overflow:auto; padding:14px 18px 20px; }
  .anyfile-wasm-viewer__summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); margin:0 0 16px; border:1px solid var(--viewer-border,#ddd); border-radius:8px; }
  .anyfile-wasm-viewer__summary div { padding:9px 12px; }
  .anyfile-wasm-viewer__summary dt { color:#64748b; font-size:11px; }
  .anyfile-wasm-viewer__summary dd { margin:3px 0 0; font-size:13px; }
  .anyfile-wasm-viewer h2 { margin:18px 0 7px; font-size:14px; }
  .anyfile-wasm-viewer table { min-width:560px; width:100%; border-collapse:collapse; font-size:12px; }
  .anyfile-wasm-viewer th, .anyfile-wasm-viewer td { border:1px solid var(--viewer-border,#ddd); padding:7px 9px; overflow-wrap:anywhere; text-align:left; vertical-align:top; }
  .anyfile-wasm-viewer th { background:#f1f5f9; white-space:nowrap; }
  .anyfile-wasm-viewer__empty { color:#64748b; font-size:12px; }
  @media (max-width:640px) { .anyfile-wasm-viewer__header, .anyfile-wasm-viewer__viewport { padding-left:12px; padding-right:12px; } }
`;
