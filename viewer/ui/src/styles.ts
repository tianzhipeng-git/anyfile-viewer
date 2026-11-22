import { viewerTheme as t } from "./tokens";

export const tableViewerStyles = `
  .anyfile-table-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:${t.background}; color:${t.foreground}; font-family:${t.fontFamily}; }
  .anyfile-table-viewer__toolbar { display:flex; flex:none; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid ${t.border}; font-size:13px; }
  .anyfile-table-viewer__name { min-width:120px; max-width:280px; margin-right:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-table-viewer select, .anyfile-table-viewer button { height:32px; border:1px solid ${t.border}; border-radius:7px; background:${t.background}; color:inherit; padding:0 10px; font:inherit; }
  .anyfile-table-viewer button:not(:disabled), .anyfile-table-viewer select:not(:disabled) { cursor:pointer; }
  .anyfile-table-viewer button:disabled, .anyfile-table-viewer select:disabled { cursor:not-allowed; opacity:.45; }
  .anyfile-table-viewer :is(button, select):focus-visible { outline:2px solid ${t.accent}; outline-offset:2px; }
  .anyfile-table-viewer__meta, .anyfile-table-viewer__type { color:${t.muted}; }
  .anyfile-table-viewer__meta { white-space:nowrap; }
  .anyfile-table-viewer__viewport { min-height:0; flex:1; overflow:auto; background:${t.surface}; }
  .anyfile-table-viewer table { min-width:100%; border-collapse:separate; border-spacing:0; background:${t.background}; font-size:12px; }
  .anyfile-table-viewer th, .anyfile-table-viewer td { box-sizing:border-box; height:32px; min-width:120px; max-width:420px; overflow:hidden; border-right:1px solid ${t.border}; border-bottom:1px solid ${t.border}; padding:5px 8px; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
  .anyfile-table-viewer thead th { position:sticky; top:0; z-index:2; background:${t.surface}; font-weight:600; }
  .anyfile-table-viewer__type { display:block; margin-top:1px; font-size:10px; font-weight:400; }
  .anyfile-table-viewer .anyfile-table-viewer__row-number { position:sticky; left:0; z-index:1; min-width:56px; width:56px; background:${t.surface}; color:${t.muted}; text-align:right; font-variant-numeric:tabular-nums; }
  .anyfile-table-viewer thead .anyfile-table-viewer__row-number { z-index:3; }
  .anyfile-table-viewer__empty { display:grid; min-height:100%; place-items:center; padding:24px; color:${t.muted}; text-align:center; }
`;
