export type RasterFormat = "TGA" | "PBM" | "PGM" | "PPM" | "PAM" | "TIFF" | "BigTIFF";

export interface DecodedRaster {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly format: RasterFormat;
  readonly bitDepth: number;
  readonly hasAlpha: boolean;
  readonly colorSpace: "sRGB" | "unknown";
  readonly orientation: number;
  readonly orientationApplied: boolean;
  readonly icc: "none" | "preserved-not-applied";
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly tiled: boolean;
  readonly compression?: string;
}

export type WorkerRequest = {
  readonly type: "decode";
  readonly id: number;
  readonly file: File;
  readonly pageIndex: number;
};

export type WorkerResponse =
  | { readonly type: "result"; readonly id: number; readonly raster: DecodedRaster }
  | { readonly type: "error"; readonly id: number; readonly code: "invalid-file" | "resource-limit"; readonly message: string };
