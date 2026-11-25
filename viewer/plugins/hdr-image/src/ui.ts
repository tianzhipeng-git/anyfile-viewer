import type { HdrCopy } from "./messages";
import type { ChannelInspectMode, HdrDecodedFrame, ToneMapOperator } from "./types";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function createHdrUi(copy: HdrCopy) {
  const root = el("div", "anyfile-hdr");
  const style = el("style");
  style.textContent = `
    .anyfile-hdr { display:flex; flex-direction:column; height:100%; min-height:0; width:100%; overflow:hidden; color:var(--viewer-foreground,#e5e7eb); background:var(--viewer-background,#111318); font-family:var(--viewer-font-family,system-ui,sans-serif); font-size:13px; }
    .anyfile-hdr .hdr-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:8px 10px; flex:none; max-height:40%; overflow:auto; border-bottom:1px solid var(--viewer-border,rgba(128,128,128,.25)); background:var(--viewer-surface,rgba(128,128,128,.06)); }
    .anyfile-hdr .hdr-group { display:inline-flex; align-items:center; gap:4px; }
    .anyfile-hdr button, .anyfile-hdr select { font:inherit; color:inherit; background:var(--viewer-background,#181b22); border:1px solid var(--viewer-border,rgba(128,128,128,.35)); border-radius:4px; padding:3px 8px; cursor:pointer; }
    .anyfile-hdr button[aria-pressed="true"] { background:var(--viewer-accent,#2563eb); border-color:var(--viewer-accent,#2563eb); color:#fff; }
    .anyfile-hdr button:disabled, .anyfile-hdr select:disabled { opacity:.45; cursor:default; }
    .anyfile-hdr label { display:inline-flex; align-items:center; gap:4px; white-space:nowrap; }
    .anyfile-hdr input[type="range"] { width:84px; accent-color:var(--viewer-accent,#2563eb); }
    .anyfile-hdr output { min-width:4.5ch; text-align:right; font-variant-numeric:tabular-nums; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
    .anyfile-hdr :focus-visible { outline:2px solid var(--viewer-accent,#2563eb); outline-offset:2px; }
    .anyfile-hdr .hdr-stage { flex:1; min-height:0; min-width:0; position:relative; overflow:hidden; background:#0b0c10; }
    .anyfile-hdr .hdr-viewport, .anyfile-hdr .hdr-sphere { position:absolute; inset:0; overflow:hidden; touch-action:none; cursor:grab; }
    .anyfile-hdr .hdr-viewport[data-dragging="true"], .anyfile-hdr .hdr-sphere[data-dragging="true"] { cursor:grabbing; }
    .anyfile-hdr canvas { display:block; width:100%; height:100%; }
    .anyfile-hdr .hdr-footer { flex:none; border-top:1px solid var(--viewer-border,rgba(128,128,128,.25)); }
    .anyfile-hdr .hdr-status { padding:4px 10px; font-size:12px; font-variant-numeric:tabular-nums; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.9; }
    .anyfile-hdr details { max-height:28vh; overflow:auto; padding:4px 10px 8px; border-top:1px solid var(--viewer-border,rgba(128,128,128,.16)); }
    .anyfile-hdr summary { cursor:pointer; font-weight:500; padding:2px 0; }
    .anyfile-hdr dl { display:grid; grid-template-columns:minmax(120px,auto) 1fr; gap:4px 14px; margin:6px 0 0; font-size:12px; }
    .anyfile-hdr dt { opacity:.7; }
    .anyfile-hdr dd { margin:0; overflow-wrap:anywhere; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
    .anyfile-hdr [hidden] { display:none !important; }
  `;

  const toolbar = el("div", "hdr-toolbar");
  const makeBtn = (parent: HTMLElement, text: string) => {
    const b = el("button");
    b.type = "button";
    b.textContent = text;
    parent.append(b);
    return b;
  };

  // View mode group (2D / 360° HDRI)
  const modeGroup = el("div", "hdr-group");
  const view2dBtn = makeBtn(modeGroup, copy.view2d);
  view2dBtn.setAttribute("aria-pressed", "true");
  const view360Btn = makeBtn(modeGroup, copy.view360);
  view360Btn.setAttribute("aria-pressed", "false");
  toolbar.append(modeGroup);

  // Part & AOV selectors
  const partLabel = el("label");
  partLabel.append(document.createTextNode(copy.part));
  const partSelect = el("select");
  partLabel.append(partSelect);
  partLabel.hidden = true;
  toolbar.append(partLabel);

  const layerLabel = el("label");
  layerLabel.append(document.createTextNode(copy.layer));
  const layerSelect = el("select");
  layerLabel.append(layerSelect);
  layerLabel.hidden = true;
  toolbar.append(layerLabel);

  // Channel inspect selector
  const channelLabel = el("label");
  channelLabel.append(document.createTextNode(copy.channel));
  const channelSelect = el("select");
  const channelOptions: ReadonlyArray<readonly [ChannelInspectMode, string]> = [
    ["rgb", copy.chRgb],
    ["r", copy.chR],
    ["g", copy.chG],
    ["b", copy.chB],
    ["a", copy.chA],
    ["luminance", copy.chLum],
    ["false-color", copy.chFalseColor],
  ];
  for (const [val, label] of channelOptions) {
    const opt = el("option");
    opt.value = val;
    opt.textContent = label;
    channelSelect.append(opt);
  }
  channelLabel.append(channelSelect);
  toolbar.append(channelLabel);

  // Tone mapping operator selector
  const tmLabel = el("label");
  tmLabel.append(document.createTextNode(copy.toneMap));
  const tmSelect = el("select");
  const tmOptions: ReadonlyArray<readonly [ToneMapOperator, string]> = [
    ["aces", copy.tmAces],
    ["reinhard", copy.tmReinhard],
    ["filmic", copy.tmFilmic],
    ["linear", copy.tmLinear],
  ];
  for (const [val, label] of tmOptions) {
    const opt = el("option");
    opt.value = val;
    opt.textContent = label;
    tmSelect.append(opt);
  }
  tmLabel.append(tmSelect);
  toolbar.append(tmLabel);

  // Exposure slider + Auto + Reset
  const expLabel = el("label");
  expLabel.append(document.createTextNode(copy.exposure));
  const exposureInput = el("input");
  exposureInput.type = "range";
  exposureInput.min = "-10";
  exposureInput.max = "10";
  exposureInput.step = "0.1";
  exposureInput.value = "0";
  const exposureOutput = el("output");
  exposureOutput.textContent = "0.0";
  expLabel.append(exposureInput, exposureOutput);
  toolbar.append(expLabel);

  // Gamma slider
  const gammaLabel = el("label");
  gammaLabel.append(document.createTextNode(copy.gamma));
  const gammaInput = el("input");
  gammaInput.type = "range";
  gammaInput.min = "0.5";
  gammaInput.max = "3.0";
  gammaInput.step = "0.05";
  gammaInput.value = "2.2";
  const gammaOutput = el("output");
  gammaOutput.textContent = "2.20";
  gammaLabel.append(gammaInput, gammaOutput);
  toolbar.append(gammaLabel);

  const gradingGroup = el("div", "hdr-group");
  const autoEvBtn = makeBtn(gradingGroup, copy.autoExposure);
  const resetGradingBtn = makeBtn(gradingGroup, copy.resetGrading);
  toolbar.append(gradingGroup);

  // 2D Viewport controls
  const nav2dGroup = el("div", "hdr-group");
  const fit = makeBtn(nav2dGroup, copy.fit);
  const actual = makeBtn(nav2dGroup, copy.actual);
  const zoomOut = makeBtn(nav2dGroup, copy.zoomOut);
  const zoomIn = makeBtn(nav2dGroup, copy.zoomIn);
  const rotateLeft = makeBtn(nav2dGroup, copy.rotateLeft);
  const rotateRight = makeBtn(nav2dGroup, copy.rotateRight);
  const zoomValue = el("output");
  nav2dGroup.append(zoomValue);
  toolbar.append(nav2dGroup);

  // 360° Sphere controls
  const nav360Group = el("div", "hdr-group");
  const resetCameraBtn = makeBtn(nav360Group, copy.resetCamera);
  const fovOutput = el("output");
  fovOutput.textContent = "75°";
  nav360Group.append(fovOutput);
  nav360Group.hidden = true;
  toolbar.append(nav360Group);

  // Stage with 2D & 360° viewports
  const stage = el("div", "hdr-stage");
  const viewport = el("div", "hdr-viewport");
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "img");
  viewport.setAttribute("aria-label", copy.imageLabel);
  const canvas2d = el("canvas");
  viewport.append(canvas2d);

  const sphereViewport = el("div", "hdr-sphere");
  sphereViewport.tabIndex = 0;
  sphereViewport.setAttribute("role", "img");
  sphereViewport.setAttribute("aria-label", copy.sphereLabel);
  sphereViewport.hidden = true;
  const canvas360 = el("canvas");
  sphereViewport.append(canvas360);

  stage.append(viewport, sphereViewport);

  // Footer: status + collapsible metadata
  const footer = el("div", "hdr-footer");
  const status = el("div", "hdr-status");
  status.setAttribute("role", "status");
  status.textContent = copy.pixelHint;

  const metadataDetails = el("details");
  const summary = el("summary");
  summary.textContent = copy.metadata;
  const metadataList = el("dl");
  metadataDetails.append(summary, metadataList);
  footer.append(status, metadataDetails);

  root.append(style, toolbar, stage, footer);

  function updateFrameSelectorsAndMetadata(frame: HdrDecodedFrame) {
    // Parts
    partSelect.replaceChildren();
    for (const part of frame.parts) {
      const opt = el("option");
      opt.value = String(part.index);
      opt.textContent = `${part.name} (${part.width}×${part.height})`;
      opt.selected = part.index === frame.partIndex;
      partSelect.append(opt);
    }
    partLabel.hidden = frame.parts.length <= 1;

    // AOV layers
    const activePart = frame.parts[frame.partIndex];
    layerSelect.replaceChildren();
    if (activePart) {
      for (const layer of activePart.layers) {
        const opt = el("option");
        opt.value = layer.id;
        opt.textContent = layer.label;
        opt.selected = layer.id === frame.layerId;
        layerSelect.append(opt);
      }
      layerLabel.hidden = activePart.layers.length <= 1;
    }

    // Alpha option availability
    const alphaOpt = channelSelect.querySelector<HTMLOptionElement>('option[value="a"]');
    if (alphaOpt) alphaOpt.disabled = !frame.hasAlpha;
    if (!frame.hasAlpha && channelSelect.value === "a") {
      channelSelect.value = "rgb";
    }

    // Metadata list
    metadataList.replaceChildren();
    const dr = frame.dynamicRange;
    const rows: Array<[string, string]> = [
      [copy.format, frame.format === "openexr" ? "OpenEXR" : "Radiance HDR"],
      [copy.dimensions, `${frame.width} × ${frame.height}`],
      [copy.dynamicRange, `${dr.minLuminance.toPrecision(3)} .. ${dr.maxLuminance.toPrecision(4)} (avg ${dr.logAverageLuminance.toPrecision(3)})`],
      [copy.suggestedEv, `${dr.suggestedExposure >= 0 ? "+" : ""}${dr.suggestedExposure.toFixed(1)} EV`],
      ...frame.metadata.map((m): [string, string] => [m.key, m.value]),
    ];
    for (const [k, v] of rows) {
      const dt = el("dt");
      const dd = el("dd");
      dt.textContent = k;
      dd.textContent = v;
      metadataList.append(dt, dd);
    }
  }

  return {
    root,
    toolbar,
    viewport,
    canvas2d,
    sphereViewport,
    canvas360,
    view2dBtn,
    view360Btn,
    partSelect,
    layerSelect,
    channelSelect,
    tmSelect,
    exposureInput,
    exposureOutput,
    gammaInput,
    gammaOutput,
    autoEvBtn,
    resetGradingBtn,
    nav2dGroup,
    nav360Group,
    fit,
    actual,
    zoomOut,
    zoomIn,
    rotateLeft,
    rotateRight,
    zoomValue,
    resetCameraBtn,
    fovOutput,
    status,
    updateFrameSelectorsAndMetadata,
  };
}
