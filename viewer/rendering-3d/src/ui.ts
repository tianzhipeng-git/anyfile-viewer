import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export function create3dUi(container: HTMLElement, locale: Locale, title: string) {
  const copy = selectMessages(locale, {
    en: { animation: "Animation", play: "Play / pause", fit: "Fit", top: "Top", front: "Front", right: "Right", iso: "Isometric", projection: "Perspective", wire: "Wireframe", all: "Show all", solo: "Only", viewport: "3D view: drag to orbit, right-drag to pan, scroll to zoom", lost: "Graphics context lost. Waiting for recovery…", objects: "Objects", zoomIn: "Zoom in", zoomOut: "Zoom out" },
    "zh-CN": { animation: "动画", play: "播放 / 暂停", fit: "适合窗口", top: "顶视", front: "前视", right: "右视", iso: "等轴测", projection: "透视", wire: "线框", all: "全部显示", solo: "单独查看", viewport: "三维视图：拖动旋转，右键拖动平移，滚轮缩放", lost: "图形上下文丢失，正在等待恢复…", objects: "对象", zoomIn: "放大", zoomOut: "缩小" },
  });
  const root = document.createElement("div");
  root.className = "anyfile-rendering-3d";
  const style = document.createElement("style");
  style.textContent = `
.anyfile-rendering-3d{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;color:var(--viewer-foreground,#222);background:var(--viewer-background,#fff);font:13px var(--viewer-font-family,system-ui)}
.anyfile-rendering-3d .r3-tools{display:flex;flex:none;gap:6px;padding:8px;overflow-x:auto;align-items:center;border-bottom:1px solid var(--viewer-border,#ddd)}
.anyfile-rendering-3d button{white-space:nowrap;font:inherit;color:inherit;background:var(--viewer-background,#fff);border:1px solid var(--viewer-border,#ddd);border-radius:5px;padding:6px;cursor:pointer}
.anyfile-rendering-3d button:focus-visible,.anyfile-rendering-3d canvas:focus-visible{outline:2px solid var(--viewer-accent,#2563eb)}
.anyfile-rendering-3d button[aria-pressed=true]{background:var(--viewer-accent,#2563eb);color:white}
.anyfile-rendering-3d .r3-body{display:flex;flex:1;min-height:0}
.anyfile-rendering-3d .r3-view{flex:1;min-width:0;position:relative;overflow:hidden}
.anyfile-rendering-3d canvas{display:block;width:100%;height:100%;touch-action:none}
.anyfile-rendering-3d .r3-tree{width:160px;max-width:30%;overflow:auto;padding:6px;flex:none;border-right:1px solid var(--viewer-border,#ddd)}
.anyfile-rendering-3d .r3-tree label{display:flex;align-items:center;gap:4px;overflow-wrap:anywhere;margin:4px 0}
.anyfile-rendering-3d .r3-status{flex:none;padding:5px 10px;font-size:11px;overflow-wrap:anywhere}
`;
  const toolbar = document.createElement("div"); toolbar.className = "r3-tools";
  const name = document.createElement("strong"); name.textContent = title; name.title = title;
  name.style.cssText = "max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0";
  toolbar.append(name);
  const body = document.createElement("div"); body.className = "r3-body";
  const tree = document.createElement("div"); tree.className = "r3-tree"; tree.setAttribute("aria-label", copy.objects); tree.hidden = true;
  const viewport = document.createElement("div"); viewport.className = "r3-view";
  const status = document.createElement("div"); status.className = "r3-status"; status.setAttribute("role", "status");
  body.append(tree, viewport); root.append(style, toolbar, body, status); container.append(root);
  function button(label: string, action: (button: HTMLButtonElement) => void) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.setAttribute("aria-label", label);
    button.onclick = () => action(button); toolbar.append(button); return button;
  }
  return { root, viewport, toolbar, tree, status, button, copy };
}
