import { InteractiveViewport } from "@anyfile/viewer-rendering";

const styles = `
  .anyfile-svg-viewer{box-sizing:border-box;display:flex;height:100%;min-height:0;width:100%;flex-direction:column;overflow:hidden;background:var(--viewer-background,#fff);color:var(--viewer-foreground,#111);font-family:var(--viewer-font-family,system-ui)}
  .anyfile-svg-viewer__toolbar{display:flex;min-height:48px;flex:none;align-items:center;gap:8px;overflow-x:auto;padding:8px 12px;border-bottom:1px solid var(--viewer-border,#ddd);background:var(--viewer-background,#fff);font-size:13px}
  .anyfile-svg-viewer__identity{min-width:120px;margin-right:auto;overflow:hidden}.anyfile-svg-viewer__name{display:block;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.anyfile-svg-viewer__meta{display:block;margin-top:2px;color:color-mix(in srgb,var(--viewer-foreground,#111) 58%,transparent);font-size:11px;white-space:nowrap}
  .anyfile-svg-viewer__controls{display:flex;align-items:center;gap:6px;white-space:nowrap}.anyfile-svg-viewer button{height:32px;min-width:32px;border:1px solid var(--viewer-border,#ddd);border-radius:7px;background:var(--viewer-background,#fff);color:inherit;padding:0 9px;font:inherit}.anyfile-svg-viewer button:hover{background:color-mix(in srgb,var(--viewer-background,#fff) 92%,var(--viewer-foreground,#111))}.anyfile-svg-viewer button:focus-visible{outline:2px solid var(--viewer-accent,#2563eb);outline-offset:1px}.anyfile-svg-viewer__zoom{display:inline-block;width:48px;text-align:center;font-variant-numeric:tabular-nums}
  .anyfile-svg-viewer__viewport{position:relative;min-height:0;flex:1;overflow:hidden;overscroll-behavior:contain;background:repeating-conic-gradient(#e7e9ec 0 25%,#f7f8f9 0 50%) 50%/20px 20px;touch-action:none;cursor:grab;user-select:none}.anyfile-svg-viewer__viewport[data-dragging=true]{cursor:grabbing}.anyfile-svg-viewer__image{position:absolute;left:50%;top:50%;display:block;max-width:none;max-height:none;transform-origin:center;box-shadow:0 8px 30px rgb(0 0 0/.18);pointer-events:none}
  @media(max-width:640px){.anyfile-svg-viewer__toolbar{align-items:flex-start;flex-wrap:wrap}.anyfile-svg-viewer__identity{width:100%}.anyfile-svg-viewer__name{max-width:100%}.anyfile-svg-viewer__controls{width:max-content}}
`;

function button(label: string, text: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", label);
  element.title = label;
  element.textContent = text;
  return element;
}

export function createSvgUi(fileName: string, width: number, height: number, removedItems: number, compressed: boolean, locale: string, image: HTMLImageElement) {
  const chinese = locale.toLowerCase().startsWith("zh");
  const root = document.createElement("div"); root.className = "anyfile-svg-viewer";
  const style = document.createElement("style"); style.textContent = styles;
  const toolbar = document.createElement("div"); toolbar.className = "anyfile-svg-viewer__toolbar"; toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", chinese ? "SVG 查看工具" : "SVG viewing tools");
  const identity = document.createElement("div"); identity.className = "anyfile-svg-viewer__identity";
  const name = document.createElement("strong"); name.className = "anyfile-svg-viewer__name"; name.textContent = fileName; name.title = fileName;
  const metadata = document.createElement("span"); metadata.className = "anyfile-svg-viewer__meta";
  const details = [compressed ? "SVGZ" : "SVG", `${width} × ${height}`];
  if (removedItems) details.push(chinese ? `已移除 ${removedItems} 项不安全内容` : `${removedItems} unsafe items removed`);
  metadata.textContent = details.join(" · "); identity.append(name, metadata);
  const controls = document.createElement("div"); controls.className = "anyfile-svg-viewer__controls";
  const zoomOut = button(chinese ? "缩小" : "Zoom out", "−");
  const zoomValue = document.createElement("output"); zoomValue.className = "anyfile-svg-viewer__zoom"; zoomValue.setAttribute("aria-live", "polite");
  const zoomIn = button(chinese ? "放大" : "Zoom in", "+");
  const fit = button(chinese ? "适合窗口" : "Fit", chinese ? "适合" : "Fit");
  const actual = button(chinese ? "实际大小" : "Actual size", "1:1");
  const rotateLeft = button(chinese ? "向左旋转" : "Rotate left", "↺");
  const rotateRight = button(chinese ? "向右旋转" : "Rotate right", "↻");
  controls.append(zoomOut, zoomValue, zoomIn, fit, actual, rotateLeft, rotateRight);
  const viewport = document.createElement("div"); viewport.className = "anyfile-svg-viewer__viewport"; viewport.tabIndex = 0; viewport.setAttribute("aria-label", chinese ? "SVG 画布，可拖动和缩放" : "SVG canvas, draggable and zoomable");
  image.className = "anyfile-svg-viewer__image"; image.alt = fileName; image.draggable = false;
  viewport.append(image); toolbar.append(identity, controls); root.append(style, toolbar, viewport);
  const interactive = new InteractiveViewport({ viewport, zoomValue, rotateLeft, rotateRight, zoomIn, zoomOut, fit, actual }, width, height, ({ scale, rotation, panX, panY }) => {
    image.style.transform = `translate(-50%, -50%) translate3d(${panX}px, ${panY}px, 0) rotate(${rotation}deg) scale(${scale})`;
  });
  return { root, interactive };
}
