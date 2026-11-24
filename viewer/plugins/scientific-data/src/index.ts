import {
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";
import { getScientificCopy } from "./copy";
import { openHdf5WorkerSource } from "./hdf5-client";
import { scientificDataManifest } from "./manifest";
import { openMatlabV4Source, openMatlabV5Source } from "./matlab-mat";
import { openNetCdfClassicSource } from "./netcdf-classic";
import { detectScientificFormat, extensionOf, PROBE_READ_BYTES } from "./probe";
import type { ScientificDataSource } from "./types";
import { createScientificDataView } from "./ui";

async function openSource(context: OpenViewerContext): Promise<ScientificDataSource> {
  const { file, signal } = context;
  signal.throwIfAborted();
  const headLen = Math.min(file.size, PROBE_READ_BYTES);
  if (headLen < 8) {
    throw new ViewerError("invalid-file", "File is too small to be a scientific data container");
  }
  const head = new Uint8Array(await file.slice(0, headLen).arrayBuffer());
  signal.throwIfAborted();

  const detected = detectScientificFormat(head, extensionOf(file.name), file.size);
  if (!detected) {
    throw new ViewerError("invalid-file", "Unrecognized HDF5, NetCDF, or MATLAB MAT container");
  }

  const { format } = detected;
  if (format === "hdf5" || format === "netcdf4" || format === "matlab-v73") {
    return openHdf5WorkerSource(file, file.name, format, signal);
  }
  if (format === "netcdf-classic" || format === "netcdf-64bit" || format === "netcdf-cdf5") {
    return openNetCdfClassicSource(file, signal);
  }
  if (format === "matlab-v5") {
    return openMatlabV5Source(file, signal);
  }
  return openMatlabV4Source(file, signal);
}

export const scientificDataPlugin: FileViewerPlugin = {
  manifest: scientificDataManifest,
  async open(context: OpenViewerContext): Promise<ViewerController> {
    const copy = getScientificCopy(context.locale);
    context.signal.throwIfAborted();
    context.reportProgress({ stage: "loading", message: copy.loading });

    const source = await openSource(context);
    if (context.signal.aborted) {
      source.dispose();
      context.signal.throwIfAborted();
    }

    const view = createScientificDataView(context.file.name, source, copy, context.locale);
    context.container.replaceChildren(view.root);
    context.reportProgress({ stage: "ready" });
    context.reportPreview?.({ outcome: "success", kind: "structure" });

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      view.dispose();
      source.dispose();
      context.container.replaceChildren();
    };
    context.signal.addEventListener("abort", dispose, { once: true });

    return {
      dispose() {
        context.signal.removeEventListener("abort", dispose);
        dispose();
      },
    };
  },
};

export default scientificDataPlugin;
