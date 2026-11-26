import type { ViewerSupportLevel, WorkspaceReader } from "./index";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface EmscriptenFS {
  mkdir(path: string): void;
  mount(type: unknown, opts: Record<string, unknown>, mountpoint: string): void;
  unmount(mountpoint: string): void;
  filesystems?: Record<string, unknown>;
}

/**
 * Dual-runtime random-access binary source shared between Web (Browser/Worker)
 * and Agent (Node worker_threads).
 */
export interface BinarySource {
  readonly name: string;
  readonly size: number;
  /** Optional real path on disk when running in Node; enables zero-copy read-only engines like node:sqlite. */
  readonly filePath?: string;

  /** Async range read usable in any JS/TS parser on any thread. */
  read(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array>;

  /** Sync range read usable inside Web Workers (FileReaderSync) and Node worker_threads (fs.readSync). */
  readSync(offset: number, target: Uint8Array): number;

  /** Optional read-only Emscripten FS mount (WORKERFS in Web Worker, read-only node in Node worker). */
  mountEmscripten?(FS: EmscriptenFS, mountDir: string): {
    readonly filePath: string;
    unmount(): void;
  };
}

export interface TargetEntry {
  readonly id: string;
  readonly title: string;
  readonly kind?: string;
  readonly size?: number;
}

export type AgentCapability = "read" | "query" | "render";

export interface InspectPayload {
  readonly metadata: Readonly<Record<string, JsonValue>>;
  readonly targets: readonly TargetEntry[];
  readonly targetsTruncated?: boolean;
}

export interface InspectResult extends InspectPayload {
  readonly pluginId: string;
  readonly formatName: string;
  readonly supportLevel: ViewerSupportLevel;
  readonly matchedBy: "extension" | "magic";
  readonly candidates: readonly {
    readonly pluginId: string;
    readonly supportLevel: ViewerSupportLevel;
  }[];
  readonly capabilities: readonly AgentCapability[];
}

export interface ReadParams {
  readonly target?: string;
  readonly cursor?: string;
  readonly filter?: string;
  readonly maxBytes: number;
}

export interface ReadResult {
  readonly content: string;
  readonly contentType: "markdown" | "json" | "text";
  readonly nextCursor?: string;
  readonly truncated: boolean;
  readonly filterApplied?: boolean;
}

export interface QueryParams {
  readonly sql: string;
  readonly target?: string;
  readonly cursor?: string;
  readonly maxBytes: number;
}

export type AgentErrorCode =
  | "invalid-argument"
  | "invalid-file"
  | "encrypted-file"
  | "missing-related-file"
  | "target-not-found"
  | "unsupported-capability"
  | "runtime-unavailable"
  | "resource-limit"
  | "timeout"
  | "access-denied";

export interface AgentFileError {
  readonly code: AgentErrorCode;
  readonly message: string;
  readonly pluginId?: string;
}

export class AgentError extends Error implements AgentFileError {
  readonly code: AgentErrorCode;
  readonly pluginId?: string;
  override readonly cause?: unknown;

  constructor(
    code: AgentErrorCode,
    message: string,
    options?: { readonly pluginId?: string; readonly cause?: unknown },
  ) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.pluginId = options?.pluginId;
    this.cause = options?.cause;
  }
}

export const AGENT_ERROR_CODES: readonly AgentErrorCode[] = [
  "invalid-argument",
  "invalid-file",
  "encrypted-file",
  "missing-related-file",
  "target-not-found",
  "unsupported-capability",
  "runtime-unavailable",
  "resource-limit",
  "timeout",
  "access-denied",
] as const;

export const DEFAULT_READ_MAX_BYTES = 48 * 1024;
export const HARD_READ_MAX_BYTES = 256 * 1024;
export const DEFAULT_INSPECT_MAX_BYTES = 8 * 1024;

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * Resolves runtime assets by the same `<pkg>/<version>/<file>` path the Web host serves under
 * `/vendor/`. Agent hosts read a local, integrity-checked cache and never fetch during extraction.
 */
export interface VendorAssets {
  /** URL that `importRuntime()` can load on this host (a `file:` URL in Node). */
  url(path: string): Promise<string>;
  bytes(path: string): Promise<Uint8Array>;
}

export interface ExtractContext {
  readonly source: BinarySource;
  readonly vendor: VendorAssets;
  readonly file: File;
  readonly workspace?: WorkspaceReader;
  readonly relativePath?: string;
  readonly signal: AbortSignal;
}

export interface StructuredExtractor {
  inspect(context: ExtractContext): Promise<InspectPayload>;
  read(context: ExtractContext, params: ReadParams): Promise<ReadResult>;
  query?(context: ExtractContext, params: QueryParams): Promise<ReadResult>;
  renderImage?(
    context: ExtractContext,
    params: { readonly target?: string; readonly maxDimension: number },
  ): Promise<RgbaImage>;
}
