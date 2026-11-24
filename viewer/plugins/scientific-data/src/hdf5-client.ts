import { createWorkerRpcClient, type WorkerRpcClient } from "@anyfile/runtime-assets";
import {
  H5WASM_RUNTIME_BASE,
  type ContainerFormat,
  type ContainerSummary,
  type DatasetInfo,
  type GroupInfo,
  type HeatmapRequest,
  type HeatmapResult,
  type ScientificDataSource,
  type SliceRequest,
  type SliceResult,
  type WorkerRequest,
  type WorkerResponse,
} from "./types";

const INIT_TIMEOUT = 30_000;
const OPERATION_TIMEOUT = 90_000;

export async function openHdf5WorkerSource(
  file: Blob,
  fileName: string,
  format: ContainerFormat,
  signal: AbortSignal,
): Promise<ScientificDataSource> {
  const worker = new Worker(new URL("./hdf5.worker.ts", import.meta.url), { type: "module" });
  const rpc: WorkerRpcClient<WorkerRequest, WorkerResponse> = createWorkerRpcClient<
    WorkerRequest,
    WorkerResponse
  >(worker, {
    signal,
    workerError: (request) => ({
      code: request.type === "init" ? "unsupported-environment" : "invalid-file",
      message: "HDF5 Worker failed.",
    }),
  });
  let nextId = 1;
  const send = <T extends WorkerResponse["type"]>(
    request: WorkerRequest,
    expectedType: T,
    timeoutMs = OPERATION_TIMEOUT,
  ) => rpc.send(request, { expectedType, timeoutMs });

  try {
    const baseUrl = new URL(H5WASM_RUNTIME_BASE, location.origin).href;
    await send({ id: nextId++, type: "init", baseUrl }, "ready", INIT_TIMEOUT);
    const opened = await send({ id: nextId++, type: "open", file, fileName, format }, "opened");
    const summary: ContainerSummary = opened.summary;
    return {
      summary,
      async listGroup(path: string): Promise<GroupInfo> {
        return (await send({ id: nextId++, type: "listGroup", path }, "group")).group;
      },
      async inspectDataset(path: string): Promise<DatasetInfo> {
        return (await send({ id: nextId++, type: "inspectDataset", path }, "dataset")).dataset;
      },
      async readSlice(request: SliceRequest): Promise<SliceResult> {
        return (await send({ id: nextId++, type: "readSlice", request }, "slice")).slice;
      },
      async readHeatmap(request: HeatmapRequest): Promise<HeatmapResult> {
        return (await send({ id: nextId++, type: "readHeatmap", request }, "heatmap")).heatmap;
      },
      dispose() {
        rpc.dispose();
      },
    };
  } catch (error) {
    rpc.dispose();
    throw error;
  }
}
