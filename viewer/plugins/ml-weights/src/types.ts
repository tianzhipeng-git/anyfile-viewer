export type ModelFormat = "safetensors" | "gguf";

export type ModelTensor = {
  readonly name: string;
  /** Original dimensions as stored by the format. */
  readonly shape: readonly number[];
  /** Element type label, e.g. "F32", "BF16", "Q4_K". */
  readonly dtype: string;
  readonly bytes: number;
};

export type ModelMetadataEntry = {
  readonly key: string;
  readonly value: string;
};

export type ModelDocument = {
  readonly format: ModelFormat;
  readonly name: string;
  /** Architecture / family, when the format exposes it. */
  readonly architecture?: string;
  /** Format version, e.g. "GGUF v3" or "Safetensors". */
  readonly version?: string;
  readonly tensorCount: number;
  readonly totalParameters: number;
  readonly totalBytes: number;
  readonly metadata: readonly ModelMetadataEntry[];
  readonly tensors: readonly ModelTensor[];
};
