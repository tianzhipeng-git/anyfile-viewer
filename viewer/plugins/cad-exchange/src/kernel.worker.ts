import { convertCad } from "./convert";
import type { CadWorkerRequest, KernelResult } from "./types";
interface Kernel { ReadFile(format: string, bytes: Uint8Array, params: object): KernelResult; HEAPU8: Uint8Array }
let kernel: Kernel;
self.onmessage = async ({ data }: MessageEvent<CadWorkerRequest>) => {
  if (data.type === "init") {
    try {
      const runtimeModule = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ data.runtimeUrl);
      kernel = await runtimeModule.default({ print() {}, printErr() {} });
      self.postMessage({ type: "ready" });
    } catch { self.postMessage({ type: "error", code: "unsupported-environment" }); }
    return;
  }
  try {
    const result = kernel.ReadFile(data.format, new Uint8Array(data.bytes), { linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio", linearDeflection: 0.001, angularDeflection: 0.3 });
    const converted = convertCad(result, kernel.HEAPU8.byteLength);
    const transfer: ArrayBuffer[] = [];
    for (const mesh of converted.meshes) for (const array of [mesh.positions,mesh.normals,mesh.colors,mesh.indices,mesh.edges]) if (array) transfer.push(array.buffer as ArrayBuffer);
    self.postMessage({ type: "opened", result: converted }, { transfer });
  } catch (error) { self.postMessage({ type: "error", code: error instanceof RangeError ? "resource-limit" : "invalid-file" }); }
};
