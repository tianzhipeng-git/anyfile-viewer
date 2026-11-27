import {
  localizeText,
  type Locale,
  type LocalizedText,
} from "@anyfile/i18n";

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  compareText,
  formatDate,
  formatNumber,
  interpolate,
  isLocale,
  localeNames,
  localizeText,
  normalizeLocale,
  selectMessages,
  type Locale,
  type LocalizedText,
} from "@anyfile/i18n";

export {
  AGENT_ERROR_CODES,
  AgentError,
  DEFAULT_INSPECT_MAX_BYTES,
  DEFAULT_READ_MAX_BYTES,
  HARD_READ_MAX_BYTES,
} from "./agent";
export {
  escapeMarkdownCell,
  markdownDocumentHeader,
  paginateLines,
  paginateText,
  parsePageTarget,
  parsePositionCursor,
  readPagedTextDocument,
  renderMarkdownTablePage,
  truncateUtf8,
  type MarkdownTablePageOptions,
  type PagedTextDocument,
} from "./agent-format";

export type {
  AgentCapability,
  AgentErrorCode,
  AgentFileError,
  BinarySource,
  EmscriptenFS,
  ExtractContext,
  InspectPayload,
  InspectResult,
  JsonValue,
  QueryParams,
  ReadParams,
  ReadResult,
  RgbaImage,
  StructuredExtractor,
  TargetEntry,
  VendorAssets,
} from "./agent";

export const VIEWER_PROTOCOL_VERSION = 2 as const;

export interface SupportedFormat {
  readonly name: LocalizedText;
  readonly extensions: readonly string[];
  readonly fileNames?: readonly string[];
  readonly mimeTypes?: readonly string[];
}

export interface ViewerPluginManifest {
  readonly protocolVersion: typeof VIEWER_PROTOCOL_VERSION;
  readonly id: string;
  readonly name: LocalizedText;
  readonly formats: readonly SupportedFormat[];
  readonly workspaceAccess: "none" | "optional" | "required";
}

export interface WorkspaceEntry {
  readonly name: string;
  readonly relativePath: string;
  readonly kind: "file" | "directory";
}

export interface WorkspaceReader {
  open(relativePath: string, options?: { signal?: AbortSignal }): Promise<File | null>;
  list(relativeDirectory?: string, options?: { signal?: AbortSignal }): AsyncIterable<WorkspaceEntry>;
}

export interface ViewerOpenProgress {
  readonly stage: string;
  readonly message?: string;
  readonly loaded?: number;
  readonly total?: number;
}

export type ViewerPreviewKind = "static" | "animation" | "video_frame" | "video_playback" | "structure";

export type ViewerPreviewResult =
  | { readonly outcome: "success"; readonly kind: ViewerPreviewKind }
  | { readonly outcome: "failure"; readonly reason: ViewerErrorCode };

export type ViewerInteraction = {
  readonly kind: "animation_control";
  readonly action: "play" | "pause" | "previous_frame" | "next_frame" | "speed_change";
};

export interface OpenViewerContext {
  readonly file: File;
  readonly relativePath?: string;
  readonly workspace?: WorkspaceReader;
  readonly container: HTMLElement;
  readonly signal: AbortSignal;
  readonly locale: Locale;
  readonly reportProgress: (progress: ViewerOpenProgress) => void;
  /** Explicit content readiness, independent of initialization. No file-derived text. */
  readonly reportPreview?: (result: ViewerPreviewResult) => void;
  /** Explicit user action only; never autoplay or file-derived values. */
  readonly reportInteraction?: (interaction: ViewerInteraction) => void;
}

export interface CaptureImageOptions {
  readonly target?: string;
  readonly maxDimension: number;
  readonly signal?: AbortSignal;
}

export interface ViewerController {
  dispose(): void | Promise<void>;
  captureImage?(options: CaptureImageOptions): Promise<Blob>;
}

export interface FileViewerPlugin {
  readonly manifest: ViewerPluginManifest;
  open(context: OpenViewerContext): Promise<ViewerController>;
}

export type ViewerSupportLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface ProbeViewerContext {
  readonly file: File;
  readonly signal: AbortSignal;
}

export interface ViewerRegistryEntry {
  readonly manifest: ViewerPluginManifest;
  /** Pure byte probe shared by Web and Agent hosts; must not touch browser-only globals. */
  probe?(context: ProbeViewerContext): Promise<ViewerSupportLevel>;
  /** Web-host override of `probe` that may also check browser capabilities (WebCodecs, Web Audio…). */
  browserProbe?(context: ProbeViewerContext): Promise<ViewerSupportLevel>;
}

export interface ViewerPluginRegistration extends ViewerRegistryEntry {
  load(): Promise<FileViewerPlugin>;
}

export interface ResolvedViewerRegistration<
  T extends ViewerRegistryEntry = ViewerPluginRegistration,
> {
  readonly registration: T;
  readonly supportLevel: Exclude<ViewerSupportLevel, 0>;
  /** Set when the candidate was found by probing file bytes rather than its name. */
  readonly matchedBy?: "magic";
}

export type ViewerErrorCode =
  | "invalid-file"
  | "missing-related-file"
  | "unsupported-environment"
  | "runtime-unavailable"
  | "resource-limit"
  | "open-failed";

export class ViewerError extends Error {
  readonly code: ViewerErrorCode;
  override readonly cause?: unknown;

  constructor(code: ViewerErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ViewerError";
    this.code = code;
    this.cause = options?.cause;
  }
}

const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateLocalizedText(value: LocalizedText): boolean {
  return typeof value === "object" && typeof value.en === "string" && value.en.trim().length > 0;
}

export function validateManifest(manifest: ViewerPluginManifest): void {
  if (manifest.protocolVersion !== VIEWER_PROTOCOL_VERSION) {
    throw new ViewerError("unsupported-environment", `Unsupported viewer protocol v${manifest.protocolVersion}.`);
  }
  if (!PLUGIN_ID_PATTERN.test(manifest.id)) {
    throw new ViewerError("open-failed", `Viewer ID “${manifest.id}” is invalid.`);
  }
  if (!validateLocalizedText(manifest.name) || manifest.formats.length === 0) {
    throw new ViewerError("open-failed", `Viewer “${manifest.id}” has an incomplete manifest.`);
  }

  for (const format of manifest.formats) {
    if (!validateLocalizedText(format.name) || (format.extensions.length === 0 && !format.fileNames?.length)) {
      throw new ViewerError("open-failed", `Viewer “${manifest.id}” contains an empty format declaration.`);
    }
    for (const fileName of format.fileNames ?? []) {
      if (!fileName.trim() || fileName.includes("/") || fileName.includes("\\")) {
        throw new ViewerError("open-failed", `Viewer “${manifest.id}” contains an invalid file-name declaration.`);
      }
    }
    for (const extension of format.extensions) {
      const invalidExtension = extension !== "*" && (
        !extension.startsWith(".") ||
        extension.length < 2 ||
        extension !== extension.toLowerCase() ||
        extension.includes("..") ||
        /[\s/\\]/.test(extension)
      );
      if (invalidExtension) {
        throw new ViewerError("open-failed", `Extension “${extension}” must be lowercase and start with a dot.`);
      }
    }
  }
}

export function validateRegistrations(registrations: readonly ViewerRegistryEntry[]): void {
  const ids = new Set<string>();
  for (const registration of registrations) {
    validateManifest(registration.manifest);
    if (ids.has(registration.manifest.id)) {
      throw new ViewerError("open-failed", `Viewer ID “${registration.manifest.id}” is registered more than once.`);
    }
    ids.add(registration.manifest.id);
  }
}

type ViewerRegistrationIndex = {
  readonly extensions: Map<string, number[]>;
  readonly fileNames: Map<string, number[]>;
  readonly wildcards: number[];
};

const registrationIndexes = new WeakMap<
  readonly ViewerRegistryEntry[],
  ViewerRegistrationIndex
>();

function addToIndex(index: Map<string, number[]>, key: string, registrationIndex: number): void {
  const registrations = index.get(key);
  if (registrations) {
    registrations.push(registrationIndex);
  } else {
    index.set(key, [registrationIndex]);
  }
}

function getRegistrationIndex(
  registrations: readonly ViewerRegistryEntry[],
): ViewerRegistrationIndex {
  const cached = registrationIndexes.get(registrations);
  if (cached) return cached;

  const index: ViewerRegistrationIndex = {
    extensions: new Map(),
    fileNames: new Map(),
    wildcards: [],
  };

  registrations.forEach(({ manifest }, registrationIndex) => {
    for (const format of manifest.formats) {
      for (const extension of format.extensions) {
        if (extension === "*") {
          index.wildcards.push(registrationIndex);
        } else {
          addToIndex(index.extensions, extension, registrationIndex);
        }
      }
      for (const fileName of format.fileNames ?? []) {
        addToIndex(index.fileNames, fileName.toLowerCase(), registrationIndex);
      }
    }
  });

  registrationIndexes.set(registrations, index);
  return index;
}

export function findViewerRegistrations<T extends ViewerRegistryEntry>(
  fileName: string,
  registrations: readonly T[],
): T[] {
  const normalizedName = fileName.toLowerCase();
  const index = getRegistrationIndex(registrations);
  const matches = new Set(index.wildcards);

  for (const registrationIndex of index.fileNames.get(normalizedName) ?? []) {
    matches.add(registrationIndex);
  }
  for (
    let dotIndex = normalizedName.indexOf(".");
    dotIndex !== -1;
    dotIndex = normalizedName.indexOf(".", dotIndex + 1)
  ) {
    const extension = normalizedName.slice(dotIndex);
    for (const registrationIndex of index.extensions.get(extension) ?? []) {
      matches.add(registrationIndex);
    }
  }

  return [...matches]
    .sort((left, right) => left - right)
    .map((registrationIndex) => registrations[registrationIndex]);
}

function isViewerSupportLevel(value: unknown): value is ViewerSupportLevel {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5;
}

/** Catch-all viewers (`*` only, no file names) such as the hex viewer. */
function isCatchAll({ manifest }: ViewerRegistryEntry): boolean {
  return manifest.formats.every((format) => format.extensions.every((ext) => ext === "*") && !format.fileNames?.length);
}

/** Wraps `file` so a probe only counts as byte evidence if it actually touched the bytes. */
function trackReads(file: File): { readonly file: File; readonly read: () => boolean } {
  let touched = false;
  const reads = new Set<PropertyKey>(["slice", "arrayBuffer", "bytes", "text", "stream"]);
  const tracked = new Proxy(file, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (reads.has(property)) touched = true;
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { file: tracked, read: () => touched };
}

async function probeCandidates<T extends ViewerRegistryEntry>(
  file: File,
  candidates: readonly T[],
  signal: AbortSignal,
  requireBytes: boolean,
): Promise<ResolvedViewerRegistration<T>[]> {
  const resolved = await Promise.all(candidates.map(async (registration, registrationIndex) => {
    let supportLevel: ViewerSupportLevel = 1;
    if (registration.probe) {
      const tracked = requireBytes ? trackReads(file) : undefined;
      try {
        const result = await registration.probe({ file: tracked?.file ?? file, signal });
        if (signal.aborted) throw abortError();
        supportLevel = isViewerSupportLevel(result) && (!tracked || tracked.read()) ? result : 0;
      } catch (error: unknown) {
        if (signal.aborted || isViewerAbortError(error)) throw abortError();
        supportLevel = 0;
      }
    }
    return { registration, registrationIndex, supportLevel };
  }));
  if (signal.aborted) throw abortError();
  return resolved
    .filter((candidate): candidate is typeof candidate & { supportLevel: Exclude<ViewerSupportLevel, 0> } => (
      candidate.supportLevel > 0
    ))
    .sort((left, right) => (
      right.supportLevel - left.supportLevel || left.registrationIndex - right.registrationIndex
    ))
    .map(({ registration, supportLevel }) => ({ registration, supportLevel }));
}

/**
 * Probes the registrations matching `file`'s name, best first. With `magicFallback`, a file whose
 * name matches nothing but catch-alls (missing or wrong extension) is also probed by every other
 * probe-capable registration; those hits come first and carry `matchedBy: "magic"`.
 */
export async function resolveViewerRegistrations<T extends ViewerRegistryEntry>(
  file: File,
  registrations: readonly T[],
  options: {
    readonly signal: AbortSignal;
    readonly workspace?: WorkspaceReader;
    readonly magicFallback?: boolean;
  },
): Promise<ResolvedViewerRegistration<T>[]> {
  const { signal, workspace } = options;
  if (signal.aborted) throw abortError();
  const usable = (registration: T) => registration.manifest.workspaceAccess !== "required" || Boolean(workspace);

  const candidates = findViewerRegistrations(file.name, registrations).filter(usable);
  const resolved = await probeCandidates(file, candidates, signal, false);
  if (!options.magicFallback || resolved.some(({ registration }) => !isCatchAll(registration))) return resolved;

  const tried = new Set<T>(candidates);
  const others = registrations.filter((registration) => (
    registration.probe && !tried.has(registration) && !isCatchAll(registration) && usable(registration)
  ));
  const magic = await probeCandidates(file, others, signal, true);
  return [...magic.map((candidate) => ({ ...candidate, matchedBy: "magic" as const })), ...resolved];
}

export function validateLoadedPlugin(
  registration: ViewerPluginRegistration,
  plugin: FileViewerPlugin,
): void {
  validateManifest(plugin.manifest);
  if (
    plugin.manifest.id !== registration.manifest.id ||
    plugin.manifest.protocolVersion !== registration.manifest.protocolVersion
  ) {
    throw new ViewerError("open-failed", `Loaded viewer “${registration.manifest.id}” does not match its registration.`);
  }
}

export function isViewerAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Standard cancellation error for probes and plugins that settle on `signal`. */
export function abortError(): DOMException {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

/**
 * Reads the whole `blob` into memory, streaming chunks and stopping as soon as
 * `signal` aborts. Use it for bounded inputs (headers/probes or files already
 * limited by the caller); callers that own an input budget enforce that budget.
 */
export async function readBlob(blob: Blob, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (signal.aborted) throw abortError();
  const reader = blob.stream().getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancel = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", cancel, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      byteLength += value.byteLength;
    }
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }

  if (signal.aborted) throw abortError();
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function normalizeViewerError(error: unknown, message = "Unable to open this file."): ViewerError {
  if (error instanceof ViewerError) return error;
  return new ViewerError("open-failed", message, { cause: error });
}

export function manifestName(manifest: ViewerPluginManifest, locale: Locale): string {
  return localizeText(manifest.name, locale);
}
