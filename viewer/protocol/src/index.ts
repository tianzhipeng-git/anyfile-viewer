export const VIEWER_PROTOCOL_VERSION = 1 as const;

export interface SupportedFormat {
  readonly name: string;
  readonly extensions: readonly string[];
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

export interface ViewerProgress {
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
  readonly reportProgress: (progress: ViewerProgress) => void;
}

export interface ViewerController {
  dispose(): void | Promise<void>;
}

export interface FileViewerPlugin {
  readonly manifest: ViewerPluginManifest;
  open(context: OpenViewerContext): Promise<ViewerController>;
}

export interface ViewerPluginRegistration {
  readonly manifest: ViewerPluginManifest;
  load(): Promise<FileViewerPlugin>;
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
    if (!format.name.trim() || format.extensions.length === 0) {
      throw new ViewerError("open-failed", `查看器 “${manifest.id}” 包含空格式声明。`);
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

export function findViewerRegistrations(
  fileName: string,
  registrations: readonly ViewerPluginRegistration[],
): ViewerPluginRegistration[] {
  const normalizedName = fileName.toLowerCase();
  return registrations.filter(({ manifest }) =>
    manifest.formats.some(({ extensions }) =>
      extensions.some((extension) => extension === "*" || normalizedName.endsWith(extension)),
    ),
  );
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
