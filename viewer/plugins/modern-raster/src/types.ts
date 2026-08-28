export interface ModernRasterInfo {
  readonly format: "JPEG XL" | "HEIC";
  readonly width: number;
  readonly height: number;
  readonly animated: boolean;
  readonly frameCount: number;
  readonly loops: number;
  readonly note?: string;
}

export type JxlWorkerRequest =
  | { readonly type: "open"; readonly id: number; readonly file: File }
  | { readonly type: "render"; readonly id: number; readonly frameIndex: number };

export type JxlWorkerResponse =
  | { readonly type: "opened"; readonly id: number; readonly width: number; readonly height: number; readonly frameCount: number; readonly loops: number; readonly png: Uint8Array; readonly durationMs: number }
  | { readonly type: "frame"; readonly id: number; readonly frameIndex: number; readonly png: Uint8Array; readonly durationMs: number }
  | { readonly type: "error"; readonly id: number; readonly code: "invalid-file" | "resource-limit" | "open-failed"; readonly message: string };
