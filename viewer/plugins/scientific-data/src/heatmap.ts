import { el } from "@anyfile/viewer-ui";
import type { ScientificCopy } from "./copy";
import { formatScalarValue, type HeatmapResult } from "./types";

export type ColormapName = "viridis" | "grayscale" | "inferno" | "coolwarm";
export type ScaleMode = "full" | "clipped";

type RgbStop = readonly [number, number, number];

const PALETTES: Record<ColormapName, readonly RgbStop[]> = {
  viridis: [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ],
  grayscale: [
    [12, 12, 14],
    [128, 128, 128],
    [248, 248, 248],
  ],
  inferno: [
    [0, 0, 4],
    [87, 16, 110],
    [188, 55, 84],
    [249, 142, 9],
    [252, 255, 164],
  ],
  coolwarm: [
    [59, 76, 192],
    [141, 176, 254],
    [221, 221, 221],
    [244, 154, 123],
    [180, 4, 38],
  ],
};

function sampleColor(palette: readonly RgbStop[], t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (palette.length - 1);
  const idx = Math.min(palette.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const a = palette[idx];
  const b = palette[idx + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

function computeRange(result: HeatmapResult, mode: ScaleMode): { lo: number; hi: number } {
  if (mode === "full" || result.finiteCount < 20) {
    return { lo: result.min, hi: result.max };
  }
  const finite = new Float64Array(result.finiteCount);
  let k = 0;
  for (let i = 0; i < result.data.length; i += 1) {
    const v = result.data[i];
    if (Number.isFinite(v)) finite[k++] = v;
  }
  finite.sort();
  const lo = finite[Math.floor(k * 0.02)] ?? result.min;
  const hi = finite[Math.min(k - 1, Math.floor(k * 0.98))] ?? result.max;
  return hi > lo ? { lo, hi } : { lo: result.min, hi: result.max };
}

function renderColorbar(canvas: HTMLCanvasElement, colormap: ColormapName) {
  canvas.width = 160;
  canvas.height = 12;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const palette = PALETTES[colormap];
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let x = 0; x < canvas.width; x += 1) {
    const [r, g, b] = sampleColor(palette, x / (canvas.width - 1));
    for (let y = 0; y < canvas.height; y += 1) {
      const off = (y * canvas.width + x) * 4;
      img.data[off] = r;
      img.data[off + 1] = g;
      img.data[off + 2] = b;
      img.data[off + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function createHeatmapView(
  result: HeatmapResult,
  copy: ScientificCopy,
  initialColormap: ColormapName = "viridis",
  initialScale: ScaleMode = "full",
): { readonly element: HTMLElement; dispose(): void } {
  const root = el("div", "anyfile-sci__heatmap");
  if (result.finiteCount === 0) {
    root.append(el("p", "anyfile-inspector__muted", copy.heatmapNoFinite));
    return { element: root, dispose() {} };
  }

  let colormap: ColormapName = initialColormap;
  let scaleMode: ScaleMode = initialScale;

  const controls = el("div", "anyfile-sci__heatmap-bar");
  const cmapSelect = el("select", "anyfile-sci__select");
  cmapSelect.setAttribute("aria-label", copy.colormapLabel);
  for (const name of ["viridis", "inferno", "coolwarm", "grayscale"] as const) {
    const opt = el("option", undefined, name);
    opt.value = name;
    cmapSelect.append(opt);
  }
  cmapSelect.value = colormap;

  const scaleSelect = el("select", "anyfile-sci__select");
  scaleSelect.setAttribute("aria-label", copy.rangeLabel);
  const optFull = el("option", undefined, copy.rangeAuto);
  optFull.value = "full";
  const optClip = el("option", undefined, copy.rangeClipped);
  optClip.value = "clipped";
  scaleSelect.append(optFull, optClip);
  scaleSelect.value = scaleMode;

  const metaNote = el(
    "span",
    "anyfile-inspector__muted",
    copy.downsampledNote(result.strideRow, result.strideCol, result.width, result.height),
  );
  controls.append(
    el("label", "anyfile-sci__field", el("span", undefined, copy.colormapLabel), cmapSelect),
    el("label", "anyfile-sci__field", el("span", undefined, copy.rangeLabel), scaleSelect),
    metaNote,
  );

  const canvasWrap = el("div", "anyfile-sci__canvas-wrap");
  const canvas = el("canvas", "anyfile-sci__canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  canvasWrap.append(canvas);

  const legend = el("div", "anyfile-sci__legend");
  const minLabel = el("span", "anyfile-sci__mono");
  const colorbar = el("canvas", "anyfile-sci__colorbar");
  const maxLabel = el("span", "anyfile-sci__mono");
  const hoverLabel = el("span", "anyfile-sci__hover anyfile-sci__mono", copy.heatmapHint);
  legend.append(minLabel, colorbar, maxLabel, hoverLabel);

  const draw = () => {
    const { lo, hi } = computeRange(result, scaleMode);
    minLabel.textContent = formatScalarValue(lo);
    maxLabel.textContent = formatScalarValue(hi);
    renderColorbar(colorbar, colormap);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(result.width, result.height);
    const palette = PALETTES[colormap];
    const span = hi > lo ? hi - lo : 1;
    for (let i = 0; i < result.data.length; i += 1) {
      const v = result.data[i];
      const off = i * 4;
      if (!Number.isFinite(v)) {
        img.data[off] = 64;
        img.data[off + 1] = 64;
        img.data[off + 2] = 64;
        img.data[off + 3] = 255;
      } else {
        const t = hi > lo ? (v - lo) / span : 0.5;
        const [r, g, b] = sampleColor(palette, t);
        img.data[off] = r;
        img.data[off + 1] = g;
        img.data[off + 2] = b;
        img.data[off + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  };

  const onCmapChange = () => {
    colormap = cmapSelect.value as ColormapName;
    draw();
  };
  const onScaleChange = () => {
    scaleMode = scaleSelect.value as ScaleMode;
    draw();
  };
  const onMouseMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(0, Math.min(result.width - 1, Math.floor(((event.clientX - rect.left) / rect.width) * result.width)));
    const y = Math.max(0, Math.min(result.height - 1, Math.floor(((event.clientY - rect.top) / rect.height) * result.height)));
    const val = result.data[y * result.width + x];
    hoverLabel.textContent = copy.heatmapHover(y * result.strideRow, x * result.strideCol, formatScalarValue(val));
  };
  const onMouseLeave = () => {
    hoverLabel.textContent = copy.heatmapHint;
  };

  cmapSelect.addEventListener("change", onCmapChange);
  scaleSelect.addEventListener("change", onScaleChange);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseleave", onMouseLeave);
  draw();

  root.append(controls, canvasWrap, legend);
  return {
    element: root,
    dispose() {
      cmapSelect.removeEventListener("change", onCmapChange);
      scaleSelect.removeEventListener("change", onScaleChange);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    },
  };
}
