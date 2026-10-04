export interface IfcGeometryData { id: number; vertices: Float32Array; indices: Uint32Array }
export interface IfcPart { geometry: number; transform: number[]; color: number[] }
export interface IfcElement { id: number; name: string; type: string; parts: IfcPart[] }
export interface IfcData { geometries: IfcGeometryData[]; elements: IfcElement[]; schema: string }
export type IfcWorkerRequest = { type: "init"; runtimeUrl: string } | { type: "open"; bytes: ArrayBuffer };
export type IfcWorkerResponse = { type: "ready" } | { type: "opened"; result: IfcData } | { type: "error"; code: "unsupported-environment" | "resource-limit" | "invalid-file" };
