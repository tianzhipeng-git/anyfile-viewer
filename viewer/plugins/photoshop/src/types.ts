export interface PhotoshopDocumentInfo {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly colorMode: string;
  readonly layerCount: number;
  readonly visibleLayerCount: number;
}

export type PhotoshopWorkerRequest = {
  readonly type: "decode";
  readonly id: number;
  readonly file: File;
};

export type PhotoshopWorkerResponse =
  | { readonly type: "decoded"; readonly id: number; readonly info: PhotoshopDocumentInfo; readonly rgba: Uint8ClampedArray<ArrayBuffer> }
  | { readonly type: "error"; readonly id: number; readonly code: "invalid-file" | "resource-limit"; readonly message: string };
