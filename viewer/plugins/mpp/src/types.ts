export const INPUT_LIMIT = 128 * 1024 * 1024;
export const RUNTIME_BASE = "/vendor/mppgo/0.0.0-0483da3-anyfile.1/";
export interface Duration { amount: number; unit: string }
export interface Task {
  id: number; uid: number; name: string; wbs: string; level: number;
  start: string | null; finish: string | null; duration: Duration; complete: number;
  summary: boolean; milestone: boolean; inactive: boolean;
  baselineStart: string | null; baselineFinish: string | null;
  predecessors: { id: number; type: string; lag: Duration }[];
  resources: string[]; notes: string;
}
export interface Resource { id: number; name: string; group: string; type: string; maxUnits: number; notes: string }
export interface ProjectDocument { name: string; tasks: Task[]; resources: Resource[] }
export type ParserError = "invalid-file" | "resource-limit" | "password-required" | "unsupported-format" | "unsupported-environment";
export type Response = { type: "ready" } | { type: "opened"; document: ProjectDocument } | { type: "error"; code: ParserError };
export type Request = { type: "init"; baseUrl: string } | { type: "open"; bytes: ArrayBuffer };
