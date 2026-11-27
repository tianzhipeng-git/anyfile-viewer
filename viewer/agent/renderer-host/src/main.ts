import { setLocalOriginFirst } from "@anyfile/runtime-assets";
import {
  ViewerError,
  type ViewerController,
  type ViewerPreviewResult,
  type WorkspaceEntry,
  type WorkspaceReader,
} from "@anyfile/viewer-protocol";
import { browserViewerLoaders } from "./generated/loaders";

setLocalOriginFirst(true);

interface OpenParams {
  readonly pluginId: string;
  readonly fileUrl: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly fileLastModified: number;
  readonly workspaceBaseUrl?: string;
  readonly workspaceListUrl?: string;
}

interface CaptureParams {
  readonly target?: string;
  readonly maxDimension: number;
}

interface RenderHostBridge {
  open(params: OpenParams): Promise<{
    readonly outcome: "success" | "failure";
    readonly hasCaptureImage?: boolean;
    readonly code?: string;
    readonly message?: string;
  }>;
  captureImage(params: CaptureParams): Promise<{
    readonly ok: boolean;
    readonly base64?: string;
    readonly mimeType?: string;
    readonly code?: string;
    readonly message?: string;
  }>;
  dispose(): Promise<void>;
}

declare global {
  interface Window {
    __ANYFILE_RENDER_HOST__?: RenderHostBridge;
  }
}

let activeController: ViewerController | null = null;
let activeAbort: AbortController | null = null;

function createHttpWorkspaceReader(listUrl: string, fileBaseUrl: string): WorkspaceReader {
  return {
    async open(relativePath: string, options?: { signal?: AbortSignal }): Promise<File | null> {
      const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${fileBaseUrl}/${encoded}`, { signal: options?.signal });
      if (!res.ok) return null;
      const blob = await res.blob();
      const name = relativePath.split("/").pop() || relativePath;
      return new File([blob], name);
    },
    async *list(relativeDirectory = "", options?: { signal?: AbortSignal }): AsyncIterable<WorkspaceEntry> {
      const url = `${listUrl}?dir=${encodeURIComponent(relativeDirectory)}`;
      const res = await fetch(url, { signal: options?.signal });
      if (!res.ok) return;
      const entries = (await res.json()) as WorkspaceEntry[];
      for (const entry of entries) {
        yield entry;
      }
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function extractErrorInfo(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof ViewerError) {
    return { code: error.code, message: error.message };
  }
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    const msg = "message" in error && typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : "Operation failed.";
    return { code: (error as { code: string }).code, message: msg };
  }
  return {
    code: "invalid-file",
    message: error instanceof Error ? error.message : String(error),
  };
}

async function disposeActive(): Promise<void> {
  activeAbort?.abort();
  activeAbort = null;
  const ctrl = activeController;
  activeController = null;
  if (ctrl) {
    try {
      await ctrl.dispose();
    } catch {
      // Ignore dispose errors on teardown.
    }
  }
  const root = document.getElementById("viewer-root");
  if (root) root.replaceChildren();
}

window.__ANYFILE_RENDER_HOST__ = {
  async open(params: OpenParams) {
    await disposeActive();
    const container = document.getElementById("viewer-root");
    if (!container) {
      return { outcome: "failure", code: "runtime-unavailable", message: "Missing #viewer-root container." };
    }

    const loader = browserViewerLoaders[params.pluginId];
    if (!loader) {
      return {
        outcome: "failure",
        code: "unsupported-capability",
        message: `No browser renderer loader registered for plugin "${params.pluginId}".`,
      };
    }

    const abortController = new AbortController();
    activeAbort = abortController;

    try {
      const response = await fetch(params.fileUrl, { signal: abortController.signal });
      if (!response.ok) {
        return { outcome: "failure", code: "access-denied", message: `Failed to fetch file (${response.status}).` };
      }
      const blob = await response.blob();
      const file = new File([blob], params.fileName, { lastModified: params.fileLastModified });
      const workspace =
        params.workspaceListUrl && params.workspaceBaseUrl
          ? createHttpWorkspaceReader(params.workspaceListUrl, params.workspaceBaseUrl)
          : undefined;

      let resolvePreview!: (result: ViewerPreviewResult) => void;
      const previewPromise = new Promise<ViewerPreviewResult>((resolve) => {
        resolvePreview = resolve;
      });
      let previewSettled = false;

      const plugin = await loader();
      const controller = await plugin.open({
        file,
        relativePath: params.fileName,
        workspace,
        container,
        signal: abortController.signal,
        locale: "en",
        reportProgress: () => undefined,
        reportPreview: (result) => {
          if (!previewSettled) {
            previewSettled = true;
            resolvePreview(result);
          }
        },
      });
      activeController = controller;

      // Wait for explicit reportPreview, with a short post-open paint fallback for plugins that don't emit it.
      const fallbackTimer = new Promise<ViewerPreviewResult>((resolve) => {
        setTimeout(() => {
          resolve({ outcome: "success", kind: "static" });
        }, 1500);
      });
      const preview = await Promise.race([previewPromise, fallbackTimer]);
      if (preview.outcome === "failure") {
        return {
          outcome: "failure",
          code: preview.reason,
          message: `Plugin "${params.pluginId}" failed to render (${preview.reason}).`,
        };
      }

      // Let one animation frame settle before capture.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return {
        outcome: "success",
        hasCaptureImage: typeof controller.captureImage === "function",
      };
    } catch (error) {
      const info = extractErrorInfo(error);
      return { outcome: "failure", code: info.code, message: info.message };
    }
  },

  async captureImage(params: CaptureParams) {
    if (!activeController?.captureImage) {
      return { ok: false, code: "unsupported-capability", message: "Active plugin does not implement captureImage()." };
    }
    try {
      const blob = await activeController.captureImage({
        target: params.target,
        maxDimension: params.maxDimension,
        signal: activeAbort?.signal,
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return {
        ok: true,
        base64: bytesToBase64(bytes),
        mimeType: blob.type || "image/png",
      };
    } catch (error) {
      const info = extractErrorInfo(error);
      return { ok: false, code: info.code, message: info.message };
    }
  },

  async dispose() {
    await disposeActive();
  },
};
