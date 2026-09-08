import { create3dViewer } from "@anyfile/rendering-3d";
import { ViewerError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { dwgManifest } from "./manifest";
import { drawingDocument } from "./adapter";
import { INPUT_LIMIT, type DrawingData } from "./types";
import { createDwgWorkerClient } from "./worker-client";
export const dwgViewer: FileViewerPlugin = {
  manifest: dwgManifest,
  async open({ file, signal, locale, container, reportProgress }) {
    const copy = selectMessages(locale, {
      en: { loading:"Reading DWG locally…", invalid:"The DWG contains no readable geometry or is damaged.", limit:"DWG resource limit reached (16 MiB file, 512 MiB kernel heap, 30 seconds, 2 million vertices or text budget).", unsupported:"The DWG WebAssembly runtime is unavailable.", note:"Model space · replacement fonts · external references and 3D solids excluded", partial:"Approximate or omitted objects", parser:"Parser warnings", source:"DWG open-source notices and source" },
      "zh-CN": { loading:"正在本地读取 DWG…", invalid:"DWG 没有可读取的几何，或文件已损坏。", limit:"DWG 达到资源上限（文件 16 MiB、内核堆 512 MiB、30 秒、200 万顶点或文字预算）。", unsupported:"DWG WebAssembly 运行环境不可用。", note:"模型空间 · 使用替代字体 · 不含外部参照和三维实体", partial:"近似或省略的对象", parser:"解析警告", source:"DWG 开源声明与源代码" },
    });
    if (signal.aborted) throw new DOMException("Aborted","AbortError");
    if (file.size > INPUT_LIMIT) throw new ViewerError("resource-limit",copy.limit);
    reportProgress({stage:"parse",message:copy.loading});
    const bytes = await file.arrayBuffer();
    if (signal.aborted) throw new DOMException("Aborted","AbortError");
    const client = await createDwgWorkerClient(signal,copy);
    let data: DrawingData;
    try { data = await client.open(bytes); } finally { client.dispose(); }
    if (signal.aborted) throw new DOMException("Aborted","AbortError");
    const description = [copy.note, data.parserWarnings ? `${copy.parser}: ${data.parserWarnings}` : "",
      Object.keys(data.warnings).length ? `${copy.partial}: ${Object.entries(data.warnings).map(([key,count]) => `${key} (${count})`).join(", ")}` : ""].filter(Boolean).join(" · ");
    const root = document.createElement("div"), viewport = document.createElement("div");
    root.style.cssText = "height:100%;min-height:0;display:flex;flex-direction:column";
    viewport.style.cssText = "flex:1;min-height:0";
    root.append(viewport); container.append(root);
    let viewer;
    try { viewer = create3dViewer(viewport,drawingDocument(data,description),locale,file.name); }
    catch (error) { root.remove(); if (error instanceof RangeError) throw new ViewerError("resource-limit",copy.limit,{cause:error}); throw error; }
    const source = document.createElement("a"); source.href = "/source/dwg.html"; source.target = "_blank"; source.rel = "noopener"; source.textContent = copy.source;
    source.style.cssText = "flex:none;padding:4px 10px;font:12px system-ui;color:var(--viewer-accent,#2563eb)";
    root.append(source);
    const dispose = () => { signal.removeEventListener("abort",dispose); viewer.dispose(); root.remove(); };
    signal.addEventListener("abort",dispose,{once:true});
    return { dispose };
  },
};
