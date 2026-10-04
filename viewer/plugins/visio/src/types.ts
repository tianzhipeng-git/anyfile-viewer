export const INPUT_LIMIT = 128 * 1024 * 1024;
export const RUNTIME_BASE = "/vendor/libvisio/0.1.11-anyfile.1/";
export type Request = { type: "init"; baseUrl: string } | { type: "open"; bytes: ArrayBuffer } | { type: "page"; index: number };
export type Response = { type: "ready" } | { type: "opened"; pages: number } | { type: "page"; svg: string } | { type: "error"; code: "invalid-file" | "resource-limit" | "unsupported-environment" };
