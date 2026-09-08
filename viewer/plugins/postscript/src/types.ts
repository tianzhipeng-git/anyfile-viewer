export interface PostscriptPageInfo {
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
}

export type PostscriptWorkerRequest =
  | { readonly type: "init"; readonly id: number; readonly runtimeUrl: string; readonly wasmUrl: string }
  | { readonly type: "open"; readonly id: number; readonly buffer: ArrayBuffer; readonly fileName: string }
  | { readonly type: "step"; readonly id: number }
  | { readonly type: "render"; readonly id: number; readonly pageIndex: number; readonly width: number; readonly height: number };

export type PostscriptWorkerResponse =
  | { readonly type: "ready"; readonly id: number }
  | { readonly type: "opened"; readonly id: number; readonly pages: readonly PostscriptPageInfo[]; readonly streaming: boolean }
  | { readonly type: "stepped"; readonly id: number; readonly pages: readonly PostscriptPageInfo[]; readonly done: boolean }
  | { readonly type: "rendered"; readonly id: number; readonly width: number; readonly height: number; readonly rgba: ArrayBuffer }
  | { readonly type: "error"; readonly id: number; readonly code: "invalid-file" | "open-failed" | "resource-limit"; readonly message: string };
