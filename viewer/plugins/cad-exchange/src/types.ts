export interface CadNode { name: string; meshes: number[]; children: CadNode[] }
export interface KernelMesh {
  name: string;
  color?: [number, number, number];
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
  brep_faces: { first: number; last: number; color?: [number,number,number] | null }[];
}
export interface KernelResult { success: boolean; error?: string; root: CadNode; meshes: KernelMesh[] }
export interface CadMeshData { name: string; positions: Float32Array; normals?: Float32Array; colors: Float32Array; indices: Uint32Array; edges: Float32Array }
export interface CadData { root: CadNode; meshes: CadMeshData[]; origin: number[]; heapBytes: number }
export type CadWorkerRequest =
  | { type: "init"; runtimeUrl: string }
  | { type: "open"; bytes: ArrayBuffer; format: string };
export type CadWorkerResponse =
  | { type: "ready" }
  | { type: "opened"; result: CadData }
  | { type: "error"; code: "unsupported-environment" | "resource-limit" | "invalid-file" };
