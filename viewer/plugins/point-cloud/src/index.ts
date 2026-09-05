import { BufferAttribute, BufferGeometry, Group, Points, PointsMaterial } from "three";
import { create3dViewer } from "@anyfile/rendering-3d";
import { ViewerError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { pointCloudManifest } from "./manifest";
export const pointCloudViewer: FileViewerPlugin = {
  manifest: pointCloudManifest,
  async open({ container, file, signal, locale }) {
    const copy = selectMessages(locale, { en: { invalid: "Invalid or unsupported point cloud.", limit: "Point cloud exceeds its resource budget (2 GiB input; LAZ compressed input 64 MiB).", sample: "Representative sample; point attributes are not displayed", progress: "points read" }, "zh-CN": { invalid: "点云无效或使用了不支持的编码。", limit: "点云超过资源上限（输入 2 GiB；LAZ 压缩输入 64 MiB）。", sample: "代表性抽样；不显示点属性", progress: "个点已读取" } });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (file.size > (file.name.toLowerCase().endsWith(".laz") ? 64 * 1024 ** 2 : 2 * 1024 ** 3)) throw new ViewerError("resource-limit", copy.limit);
    const worker = new Worker(new URL("./points.worker.ts", import.meta.url), { type: "module" });
    let viewer: ReturnType<typeof create3dViewer> | undefined; let disposed = false; let opened = false;
    const geometry = new BufferGeometry(); const material = new PointsMaterial({ color: 0x598eb5, size: 2, sizeAttenuation: false }); const root = new Group(); root.add(new Points(geometry, material));
    const status = document.createElement("div"); status.setAttribute("role", "status");
    return new Promise((resolve, reject) => {
      const dispose = () => { if (disposed) return; disposed = true; worker.terminate(); signal.removeEventListener("abort", abort); if (viewer) viewer.dispose(); else { geometry.dispose(); material.dispose(); } };
      const abort = () => { dispose(); if (!opened) reject(new DOMException("Aborted", "AbortError")); };
      const fail = (error: unknown) => {
        worker.terminate();
        if (opened && viewer) { status.textContent = copy.invalid; status.setAttribute("role", "alert"); }
        else { dispose(); reject(error); }
      };
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }) => {
        if (disposed) return;
        try {
          if (data.error) throw new ViewerError(data.error, data.error === "resource-limit" ? copy.limit : copy.invalid);
          geometry.dispose(); geometry.setAttribute("position", new BufferAttribute(data.positions, 3)); geometry.boundingBox = null; geometry.boundingSphere = null;
          root.userData.origin = data.origin;
          if (!viewer) { viewer = create3dViewer(container, { root, up: "z", description: copy.sample }, locale, file.name); viewer.root.append(status); }
          else viewer.refresh();
          status.textContent = `${data.count.toLocaleString(locale)} ${copy.progress} · ${Math.min(data.count, 200_000).toLocaleString(locale)}`;
          if (!opened) { opened = true; resolve({ dispose }); }
          if (data.done) worker.terminate();
        } catch (error) { fail(error); }
      };
      worker.onerror = () => fail(new ViewerError("invalid-file", copy.invalid));
      if (signal.aborted) return abort(); worker.postMessage(file);
    });
  },
};
