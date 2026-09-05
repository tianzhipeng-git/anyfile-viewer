import { create3dViewer } from "@anyfile/rendering-3d";
import { ViewerError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { cadExchangeManifest } from "./manifest";
import { cadExchangeDocument } from "./adapter";
import type { CadData } from "./types";
import { createCadWorkerClient } from "./worker-client";
export const cadExchangeViewer: FileViewerPlugin = {
  manifest: cadExchangeManifest,
  async open({file,signal,locale,container,reportProgress}) {
    const copy = selectMessages(locale, { en:{ loading:"Tessellating CAD geometry locally…", invalid:"The CAD file could not be tessellated.", limit:"CAD input or tessellation exceeds its resource budget (16 MiB input, 256 MiB kernel heap).", unsupported:"The CAD WebAssembly runtime is unavailable." }, "zh-CN":{ loading:"正在本地离散化 CAD 几何…", invalid:"无法将 CAD 文件离散化为可见几何。", limit:"CAD 输入或离散化结果超限（输入 16 MiB，内核堆 256 MiB）。", unsupported:"CAD WebAssembly 运行环境不可用。" } });
    if (signal.aborted) throw new DOMException("Aborted","AbortError");
    if (file.size > 16 * 1024 * 1024) throw new ViewerError("resource-limit",copy.limit);
    reportProgress({stage:"tessellation",message:copy.loading});
    const bytes = await file.arrayBuffer();
    if (signal.aborted) throw new DOMException("Aborted","AbortError");
    const ext = file.name.split(".").pop()?.toLowerCase(); const format = ext === "brep" ? "brep" : ext === "igs" || ext === "iges" ? "iges" : "step";
    const client = await createCadWorkerClient(signal, copy);
    let data: CadData;
    try { data = await client.open(bytes, format); }
    finally { client.dispose(); }
    if (signal.aborted) throw new DOMException("Aborted","AbortError");
    const viewer = create3dViewer(container,cadExchangeDocument(data,format === "brep"),locale,file.name);
    const dispose = () => { signal.removeEventListener("abort",dispose); viewer.dispose(); };
    signal.addEventListener("abort",dispose,{once:true}); return {dispose};
  },
};
