import type { ViewerErrorCode } from "@anyfile/viewer-protocol";

export type DjvuDocumentKind = "single" | "bundled" | "indirect" | "old-bundled" | "old-indexed";

export interface DjvuPageMetrics {
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly rotation: number;
}

export interface DjvuOutlineItem {
  readonly title: string;
  readonly page: number;
  readonly children: readonly DjvuOutlineItem[];
}

export interface DjvuTextWord {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly t: string;
}

export interface DjvuPageText {
  readonly scale: number;
  readonly words: readonly DjvuTextWord[];
}

export interface DjvuOpenResult {
  readonly docType: DjvuDocumentKind;
  readonly pageCount: number;
  readonly pages: readonly DjvuPageMetrics[];
  readonly outline: readonly DjvuOutlineItem[];
}

export type DjvuWorkerRequest =
  | { type: "init"; id: number; runtimeUrl: string; wasmUrl: string }
  | { type: "open"; id: number; buffer: ArrayBuffer }
  | { type: "render"; id: number; pageIndex: number; width: number; height: number; thumbnail?: boolean }
  | { type: "text"; id: number; pageIndex: number };

export type DjvuWorkerResponse =
  | { type: "ready"; id: number }
  | { type: "opened"; id: number; document: DjvuOpenResult }
  | { type: "rendered"; id: number; width: number; height: number; rgba: ArrayBuffer }
  | { type: "text"; id: number; pageText: DjvuPageText | null }
  | { type: "error"; id: number; code: ViewerErrorCode; message: string };
