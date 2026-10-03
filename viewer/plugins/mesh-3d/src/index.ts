import { create3dViewer, disposeObject, type Rendering3dDocument } from "@anyfile/rendering-3d";
import { ViewerError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { mesh3dManifest } from "./manifest";
export const mesh3dViewer: FileViewerPlugin = {
  manifest: mesh3dManifest,
  async open(context) {
    const { signal, locale, file } = context;
    const ext = file.name.split(".").pop()?.toLowerCase();
    const inputLimitMiB = ext === "obj" ? 256 : 128;
    const copy = selectMessages(locale, { en: { loading: "Reading 3D geometry…", invalid: "The model is invalid or uses unsupported features.", inputLimit: `The model file exceeds the ${inputLimitMiB} MiB input limit.`, limit: "The model exceeds a geometry, material, texture or parser memory limit." }, "zh-CN": { loading: "正在读取三维几何…", invalid: "模型无效或使用了暂不支持的特性。", inputLimit: `模型文件超过 ${inputLimitMiB} MiB 输入上限。`, limit: "模型超过几何、材质、纹理或解析器内存资源上限。" } });
    let document: Rendering3dDocument | undefined; let viewer: ReturnType<typeof create3dViewer> | undefined; let disposed = false;
    const dispose = () => { if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); if (viewer) viewer.dispose(); else if (document) disposeObject(document.root); };
    try {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (file.size > inputLimitMiB * 1024 * 1024) throw new ViewerError("resource-limit", copy.inputLimit);
      context.reportProgress({ stage: "parsing", message: copy.loading });
      const bytes = await file.arrayBuffer();
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      switch (ext) {
        case "stl": document = await (await import("./stl-adapter")).loadStl(bytes, signal); break;
        case "off": document = (await import("./off")).loadOff(new TextDecoder().decode(bytes)); break;
        case "ply": document = (await import("./ply")).loadPly(bytes); break;
        case "obj": document = await (await import("./obj")).loadObj(new TextDecoder().decode(bytes), context); break;
        case "glb": case "gltf": document = await (await import("./gltf")).loadGltf(bytes, context); break;
        case "skp": document = await (await import("./skp-adapter")).loadSkp(bytes, context); break;
        default: throw new Error("Unsupported extension");
      }
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      viewer = create3dViewer(context.container, document, locale, file.name);
      signal.addEventListener("abort", dispose, { once: true });
      return { dispose };
    } catch (error) {
      dispose();
      if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
      throw new ViewerError(error instanceof RangeError ? "resource-limit" : "invalid-file", error instanceof RangeError ? copy.limit : copy.invalid, { cause: error });
    }
  },
};
