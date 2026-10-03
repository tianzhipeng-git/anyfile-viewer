import type { DicomInfo } from "./types";
import type { Copy } from "./messages";

export function createUI(info: DicomInfo, copy: Copy) {
  const root = document.createElement("div");
  root.className = "anyfile-dicom";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-dicom { display:flex; flex-direction:column; height:100%; min-height:0; width:100%; overflow:hidden; color:var(--viewer-foreground,#222); background:var(--viewer-background,#fff); font-family:var(--viewer-font-family,sans-serif); }
    .anyfile-dicom .dicom-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:8px; flex:none; max-height:40%; overflow:auto; border-bottom:1px solid var(--viewer-border,#ccc); }
    .anyfile-dicom button,.anyfile-dicom input { font:inherit; color:inherit; background:var(--viewer-background,#fff); border:1px solid var(--viewer-border,#ccc); border-radius:4px; padding:4px 8px; }
    .anyfile-dicom button:disabled { opacity:.5; }
    .anyfile-dicom output { flex:none; width:6ch; font-variant-numeric:tabular-nums; }
    .anyfile-dicom label { display:inline-flex; align-items:center; gap:4px; }
    .anyfile-dicom input { width:90px; }
    .anyfile-dicom :focus-visible { outline:2px solid var(--viewer-accent,#3984e8); outline-offset:2px; }
    .anyfile-dicom .dicom-viewport { flex:1; min-height:0; min-width:0; position:relative; overflow:hidden; touch-action:none; background:#111; }
    .anyfile-dicom canvas { display:block; width:100%; height:100%; }
    .anyfile-dicom .dicom-status { flex:none; padding:4px 8px; }
    .anyfile-dicom details { flex:none; max-height:30%; overflow:auto; padding:8px; }
    .anyfile-dicom[data-metadata-only] details { flex:1; max-height:none; }
    .anyfile-dicom dl { display:grid; grid-template-columns:minmax(100px,auto) 1fr; gap:6px 16px; }
    .anyfile-dicom dd { margin:0; overflow-wrap:anywhere; }
    .anyfile-dicom [hidden] { display:none; }
  `;
  const toolbar = document.createElement("div");
  toolbar.className = "dicom-toolbar";
  const button = (text: string) => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = text;
    toolbar.append(node);
    return node;
  };
  const fit = button(copy.fit), actual = button(copy.actual);
  const zoomOut = button(copy.zoomOut), zoomIn = button(copy.zoomIn);
  const rotateLeft = button(copy.left), rotateRight = button(copy.right);
  const zoomValue = document.createElement("output");
  toolbar.append(zoomValue);
  const number = (text: string, value: number) => {
    const label = document.createElement("label");
    label.append(document.createTextNode(text));
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(value);
    input.step = "any";
    label.append(input);
    toolbar.append(label);
    return input;
  };
  const frame = number(copy.frame, 1);
  frame.min = "1"; frame.max = String(info.frames); frame.step = "1";
  const center = number(copy.center, 0), width = number(copy.width, 1);
  width.min = "1";
  const apply = button(copy.apply), reset = button(copy.auto);
  if (info.photometric === "RGB") {
    center.parentElement!.hidden = true; width.parentElement!.hidden = true;
    apply.hidden = true; reset.hidden = true;
  }
  const viewport = document.createElement("div");
  viewport.className = "dicom-viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "img");
  viewport.setAttribute("aria-label", copy.image);
  const canvas = document.createElement("canvas");
  viewport.append(canvas);
  const status = document.createElement("div");
  status.className = "dicom-status";
  status.setAttribute("role", "status");
  const metadata = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = copy.metadata;
  const list = document.createElement("dl");
  const fields = [
    [copy.modality, info.modality], [copy.date, info.date], [copy.syntaxLabel, info.syntax], [copy.sopClass, info.sopClass],
    [copy.dimensions, info.width && info.height ? `${info.width} × ${info.height}` : ""],
    [copy.frames, info.frames], [copy.bits, info.bits || ""], [copy.photometric, info.photometric],
  ];
  for (const [name, value] of fields) {
    const term = document.createElement("dt"), detail = document.createElement("dd");
    term.textContent = String(name); detail.textContent = String(value || "—");
    list.append(term, detail);
  }
  metadata.append(summary, list);
  root.append(style, toolbar, viewport, status, metadata);
  if (info.reason) {
    root.dataset.metadataOnly = "true";
    toolbar.hidden = true; viewport.hidden = true; metadata.open = true;
    status.textContent = copy[info.reason];
  }
  return { root, toolbar, viewport, canvas, status, frame, center, width, apply, reset, fit, actual, zoomIn, zoomOut, rotateLeft, rotateRight, zoomValue };
}
export type DicomUI = ReturnType<typeof createUI>;
