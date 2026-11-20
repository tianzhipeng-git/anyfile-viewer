export type BinaryContainerFormat = "ELF" | "PE" | "COFF" | "Mach-O" | "Mach-O Fat" | "Unix Archive";

export type KeyValueRow = {
  readonly key: string;
  readonly value: string;
};

export type SegmentEntry = {
  readonly name: string;
  readonly flags: string;
  readonly offset: string;
  readonly virtualAddress: string;
  readonly fileSize: string;
  readonly memorySize: string;
  readonly detail: string;
};

export type SectionEntry = {
  readonly index: number;
  readonly name: string;
  readonly type: string;
  readonly flags: string;
  readonly address: string;
  readonly offset: string;
  readonly size: number;
};

export type DependencyEntry = {
  readonly kind: string;
  readonly name: string;
  readonly detail: string;
};

export type SymbolEntry = {
  readonly name: string;
  readonly kind: string;
  readonly binding: string;
  readonly section: string;
  readonly value: string;
  readonly size?: string;
};

export type ArchiveMemberEntry = {
  readonly index: number;
  readonly name: string;
  readonly size: number;
  readonly mode: string;
  readonly mtime: string;
  readonly kind: string;
  readonly offset: number;
};

export type BinarySliceReport = {
  readonly label: string;
  readonly architecture: string;
  readonly kind: string;
  readonly endianness: string;
  readonly entryPoint: string;
  readonly metadata: readonly KeyValueRow[];
  readonly segments: readonly SegmentEntry[];
  readonly sections: readonly SectionEntry[];
  readonly dependencies: readonly DependencyEntry[];
  readonly symbols: readonly SymbolEntry[];
  readonly totalSymbols: number;
  readonly symbolsTruncated: boolean;
  readonly members?: readonly ArchiveMemberEntry[];
  readonly totalMembers?: number;
  readonly membersTruncated?: boolean;
  readonly notices: readonly string[];
};

export type NativeBinaryReport = {
  readonly format: BinaryContainerFormat;
  readonly fileSize: number;
  readonly summary: string;
  readonly slices: readonly BinarySliceReport[];
};
