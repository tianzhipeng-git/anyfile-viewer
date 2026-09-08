export type Point = { x: number; y: number; z?: number };
export type Tuple3 = [number, number, number];
export interface DrawingText {
  text: string; position: Tuple3; xAxis: Tuple3; yAxis: Tuple3;
  layer: string; color: number; alignX: number; alignY: number; width?: number;
}
export interface DrawingBatch { layer: string; color: number; kind: "lines" | "triangles" | "points"; positions: Float32Array }
export interface DrawingData {
  batches: DrawingBatch[]; texts: DrawingText[]; layers: Record<string, boolean>;
  origin: Tuple3; units?: number; entityCount: number; vertexCount: number;
  warnings: Record<string, number>; parserWarnings: number; heapBytes: number;
}
export type Request = { type: "init"; runtimeUrl: string } | { type: "open"; bytes: ArrayBuffer };
export type Response = { type: "ready" } | { type: "opened"; result: DrawingData } | { type: "error"; code: "resource-limit" | "invalid-file" | "unsupported-environment" };
export const INPUT_LIMIT = 16 * 1024 * 1024;
export const MAX_ENTITIES = 200_000;
export const MAX_VERTICES = 2_000_000;
export const MAX_TEXTS = 2_000;
