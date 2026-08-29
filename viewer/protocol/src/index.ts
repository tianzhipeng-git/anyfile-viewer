export const VIEWER_PROTOCOL_VERSION = 1 as const;

export interface SupportedFormat {
  readonly name: string;
  readonly extensions: readonly string[];
  readonly fileNames?: readonly string[];
  readonly mimeTypes?: readonly string[];
}

export interface ViewerPluginManifest {
  readonly protocolVersion: typeof VIEWER_PROTOCOL_VERSION;
  readonly id: string;
  readonly name: string;
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

export interface OpenViewerContext {
  readonly file: File;
  readonly relativePath?: string;
  readonly workspace?: WorkspaceReader;
  readonly container: HTMLElement;
  readonly signal: AbortSignal;
  readonly locale: string;
  readonly reportProgress: (progress: ViewerOpenProgress) => void;
}

export interface ViewerController {
  dispose(): void | Promise<void>;
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

export interface ViewerPluginRegistration {
  readonly manifest: ViewerPluginManifest;
  probe?(context: ProbeViewerContext): Promise<ViewerSupportLevel>;
  load(): Promise<FileViewerPlugin>;
}

export interface ResolvedViewerRegistration {
  readonly registration: ViewerPluginRegistration;
  readonly supportLevel: Exclude<ViewerSupportLevel, 0>;
}

export type ViewerErrorCode =
  | "invalid-file"
  | "missing-related-file"
  | "unsupported-environment"
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

export function validateManifest(manifest: ViewerPluginManifest): void {
  if (manifest.protocolVersion !== VIEWER_PROTOCOL_VERSION) {
    throw new ViewerError("unsupported-environment", `不支持查看器协议 v${manifest.protocolVersion}。`);
  }
  if (!PLUGIN_ID_PATTERN.test(manifest.id)) {
    throw new ViewerError("open-failed", `查看器 ID “${manifest.id}” 不合法。`);
  }
  if (!manifest.name.trim() || manifest.formats.length === 0) {
    throw new ViewerError("open-failed", `查看器 “${manifest.id}” 的 Manifest 不完整。`);
  }

  for (const format of manifest.formats) {
    if (!format.name.trim() || (format.extensions.length === 0 && !format.fileNames?.length)) {
      throw new ViewerError("open-failed", `查看器 “${manifest.id}” 包含空格式声明。`);
    }
    for (const fileName of format.fileNames ?? []) {
      if (!fileName.trim() || fileName.includes("/") || fileName.includes("\\")) {
        throw new ViewerError("open-failed", `查看器 “${manifest.id}” 包含不合法的文件名声明。`);
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
        throw new ViewerError("open-failed", `扩展名 “${extension}” 必须为带点的小写形式。`);
      }
    }
  }
}

export function validateRegistrations(registrations: readonly ViewerPluginRegistration[]): void {
  const ids = new Set<string>();
  for (const registration of registrations) {
    validateManifest(registration.manifest);
    if (ids.has(registration.manifest.id)) {
      throw new ViewerError("open-failed", `查看器 ID “${registration.manifest.id}” 重复注册。`);
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
  readonly ViewerPluginRegistration[],
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
  registrations: readonly ViewerPluginRegistration[],
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

export function findViewerRegistrations(
  fileName: string,
  registrations: readonly ViewerPluginRegistration[],
): ViewerPluginRegistration[] {
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

export async function resolveViewerRegistrations(
  file: File,
  registrations: readonly ViewerPluginRegistration[],
  options: {
    readonly signal: AbortSignal;
    readonly workspace?: WorkspaceReader;
  },
): Promise<ResolvedViewerRegistration[]> {
  const { signal, workspace } = options;
  if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");

  const candidates = findViewerRegistrations(file.name, registrations)
    .filter(({ manifest }) => manifest.workspaceAccess !== "required" || Boolean(workspace));
  const resolved = await Promise.all(candidates.map(async (registration, registrationIndex) => {
    let supportLevel: ViewerSupportLevel = 1;

    if (registration.probe) {
      try {
        const result = await registration.probe({ file, signal });
        if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        supportLevel = isViewerSupportLevel(result) ? result : 0;
      } catch (error: unknown) {
        if (signal.aborted || isViewerAbortError(error)) {
          throw new DOMException("The operation was aborted.", "AbortError");
        }
        supportLevel = 0;
      }
    }

    return { registration, registrationIndex, supportLevel };
  }));

  if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");

  return resolved
    .filter((candidate): candidate is typeof candidate & { supportLevel: Exclude<ViewerSupportLevel, 0> } => (
      candidate.supportLevel > 0
    ))
    .sort((left, right) => (
      right.supportLevel - left.supportLevel || left.registrationIndex - right.registrationIndex
    ))
    .map(({ registration, supportLevel }) => ({ registration, supportLevel }));
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
    throw new ViewerError("open-failed", `查看器 “${registration.manifest.id}” 的加载结果与注册信息不一致。`);
  }
}

export function isViewerAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function normalizeViewerError(error: unknown, message = "无法打开这个文件。"): ViewerError {
  if (error instanceof ViewerError) return error;
  return new ViewerError("open-failed", message, { cause: error });
}
