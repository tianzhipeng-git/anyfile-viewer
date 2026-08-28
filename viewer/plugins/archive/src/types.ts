export type ReadPurpose = "header" | "trailer" | "index" | "directory";

export type ReadAuditRecord = {
  readonly start: number;
  readonly end: number;
  readonly purpose: ReadPurpose;
};

export type MetadataField = {
  readonly label: string;
  readonly value: string;
};

export type ArchiveEntry = {
  readonly path: string;
  readonly type: string;
  readonly size?: number;
  readonly compressedSize?: number;
  readonly modified?: Date;
  readonly method?: string;
  readonly checksum?: string;
  readonly permissions?: string;
  readonly linkTarget?: string;
  readonly comment?: string;
  readonly encrypted?: boolean;
  readonly dangerousPath: boolean;
};

export type ArchiveMetadata = {
  readonly format: string;
  readonly kind: "archive" | "wrapper" | "bare";
  readonly detectedBy: string;
  readonly fields: readonly MetadataField[];
  readonly entries?: readonly ArchiveEntry[];
  readonly limitation?: string;
};

export type ArchiveFormatId =
  | "zip"
  | "tar"
  | "gzip"
  | "xz"
  | "zstd"
  | "bzip2"
  | "lz4"
  | "zlib"
  | "deflate"
  | "brotli";

export type IdentifiedFormat = {
  readonly id: ArchiveFormatId;
  readonly extension: string;
  readonly magicMatched: boolean;
  readonly compoundTar: boolean;
};
