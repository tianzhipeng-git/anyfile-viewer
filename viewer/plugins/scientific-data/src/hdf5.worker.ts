import { Hdf5Engine, type H5FileLike } from "./hdf5-engine";
import type { WorkerRequest, WorkerResponse } from "./types";

type H5WasmModule = {
  readonly ready: Promise<{
    readonly FS: {
      mkdir(path: string): void;
      mount(type: unknown, opts: { files?: Blob[]; blobs?: { name: string; data: Blob }[] }, mountpoint: string): void;
      unmount(mountpoint: string): void;
      filesystems: { readonly WORKERFS: unknown };
    };
  }>;
  readonly File: new (filename: string, mode: "r") => H5FileLike;
};

let h5wasmMod: H5WasmModule | undefined;
let emFs: Awaited<H5WasmModule["ready"]>["FS"] | undefined;
let engine: Hdf5Engine | undefined;
let mountedPath: string | undefined;

const send = (response: WorkerResponse, transfer?: Transferable[]) => {
  if (transfer && transfer.length > 0) {
    self.postMessage(response, { transfer });
  } else {
    self.postMessage(response);
  }
};

function cleanupMount() {
  engine?.close();
  engine = undefined;
  if (mountedPath && emFs) {
    try {
      emFs.unmount(mountedPath);
    } catch {
      // Ignore unmount errors.
    }
    mountedPath = undefined;
  }
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.type === "init") {
      const mod = (await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ `${data.baseUrl}hdf5_hl.js`
      )) as { default?: H5WasmModule } & H5WasmModule;
      const api = mod.default ?? mod;
      const runtime = await api.ready;
      h5wasmMod = api;
      emFs = runtime.FS;
      send({ id: data.id, type: "ready" });
      return;
    }

    if (data.type === "open") {
      if (!h5wasmMod || !emFs) {
        send({ id: data.id, type: "error", code: "unsupported-environment", message: "HDF5 runtime not initialized" });
        return;
      }
      cleanupMount();
      const mountDir = `/work_${data.id}`;
      const safeName = data.fileName.replace(/[/\\]/g, "_") || "input.h5";
      try {
        emFs.mkdir(mountDir);
      } catch {
        // Directory may already exist.
      }
      emFs.mount(emFs.filesystems.WORKERFS, { blobs: [{ name: safeName, data: data.file }] }, mountDir);
      mountedPath = mountDir;
      const file = new h5wasmMod.File(`${mountDir}/${safeName}`, "r");
      engine = new Hdf5Engine(file, data.format, data.file.size);
      send({ id: data.id, type: "opened", summary: engine.summary() });
      return;
    }

    if (!engine) {
      send({ id: data.id, type: "error", code: "invalid-file", message: "No HDF5 file is open" });
      return;
    }

    if (data.type === "listGroup") {
      send({ id: data.id, type: "group", group: engine.listGroup(data.path) });
      return;
    }
    if (data.type === "inspectDataset") {
      send({ id: data.id, type: "dataset", dataset: engine.inspectDataset(data.path) });
      return;
    }
    if (data.type === "readSlice") {
      send({ id: data.id, type: "slice", slice: engine.readSlice(data.request) });
      return;
    }
    if (data.type === "readHeatmap") {
      const heatmap = engine.readHeatmap(data.request);
      send({ id: data.id, type: "heatmap", heatmap }, [heatmap.data.buffer]);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = data.type === "init" ? "unsupported-environment" : "invalid-file";
    send({ id: data.id, type: "error", code, message: `HDF5 ${data.type} failed: ${detail}` });
  }
};
