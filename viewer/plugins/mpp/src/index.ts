import { ViewerError, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { mppManifest } from "./manifest";
import { copyFor } from "./messages";
import { readBlob } from "./read";
import { hasOleHeader } from "./probe";
import { INPUT_LIMIT } from "./types";
import { createProjectView } from "./ui";
import { MppWorkerClient } from "./worker-client";

export const mppViewer: FileViewerPlugin = {
  manifest: mppManifest,
  async open(context) {
    const { file, signal, locale, container, reportProgress } = context;
    const copy = copyFor(locale);
    let client: MppWorkerClient | undefined;
    let root: HTMLElement | undefined;
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      signal.removeEventListener("abort", dispose);
      client?.dispose();
      root?.remove();
    };
    try {
      signal.throwIfAborted();
      if (file.size > INPUT_LIMIT) throw new ViewerError("resource-limit", copy.limit);
      if (file.size < 512 || !hasOleHeader(new Uint8Array(await readBlob(file.slice(0, 512), signal)))) throw new ViewerError("invalid-file", copy.invalid);
      signal.throwIfAborted();
      signal.addEventListener("abort", dispose, { once: true });
      reportProgress({ stage: "reading", message: copy.reading });
      client = new MppWorkerClient(signal, copy);
      await client.initialize();
      signal.throwIfAborted();
      const bytes = await readBlob(file, signal);
      signal.throwIfAborted();
      const project = await client.open(bytes);
      signal.throwIfAborted();
      client.dispose();
      reportProgress({ stage: "rendering", message: copy.rendering });
      root = createProjectView(file.name, project, locale);
      container.append(root);
      context.reportPreview?.({ outcome: "success", kind: "structure" });
      return { dispose };
    } catch (error) {
      dispose();
      if (signal.aborted) signal.throwIfAborted();
      if (error instanceof ViewerError) throw error;
      throw new ViewerError("invalid-file", copy.invalid, { cause: error });
    }
  },
};
export { mppManifest } from "./manifest";
