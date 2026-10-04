import { create3dViewer } from "@anyfile/rendering-3d";
import { ViewerError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { ifcManifest } from "./manifest";
import { probeIfc } from "./probe";
import { ifcDocument } from "./adapter";
import { createIfcWorkerClient } from "./worker-client";
export const ifcViewer: FileViewerPlugin = {
  manifest: ifcManifest,
  async open({ file, signal, locale, container, reportProgress, reportPreview }) {
    const copy = selectMessages(locale, {
      en: { loading: "Reading IFC building geometry locally…", invalid: "The IFC file is invalid, unsupported or contains no visible geometry.", limit: "IFC exceeds a resource limit: 128 MiB input, 6 million vertices, 256 MiB geometry, 4,096 draw calls or 120 seconds parsing.", unsupported: "The IFC WebAssembly runtime is unavailable." },
      "zh-CN": { loading: "正在本地读取 IFC 建筑几何…", invalid: "IFC 文件无效、不受支持或没有可见几何。", limit: "IFC 超出资源上限：输入 128 MiB、600 万顶点、256 MiB 几何、4,096 次绘制或解析时间 120 秒。", unsupported: "IFC WebAssembly 运行环境不可用。" },
    });
    signal.throwIfAborted();
    if (file.size > 128 * 1024 * 1024) throw new ViewerError("resource-limit", copy.limit);
    if (!await probeIfc({ file, signal })) throw new ViewerError("invalid-file", copy.invalid);
    reportProgress({ stage: "geometry", message: copy.loading });
    const bytes = await file.arrayBuffer(); signal.throwIfAborted();
    const client = await createIfcWorkerClient(signal, copy);
    let data;
    try { data = await client.open(bytes); } finally { client.dispose(); }
    signal.throwIfAborted();
    const viewer = create3dViewer(container, ifcDocument(data), locale, file.name);
    const dispose = () => { signal.removeEventListener("abort", dispose); viewer.dispose(); };
    signal.addEventListener("abort", dispose, { once: true });
    reportPreview?.({ outcome: "success", kind: "static" });
    return { dispose };
  },
};
