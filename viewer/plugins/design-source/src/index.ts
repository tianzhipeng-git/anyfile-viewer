import {
  abortError,
  readBlob,
  ViewerError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";
import { parseFigmaDocument } from "./figma-parser";
import { getMessages } from "./i18n";
import { designSourceManifest } from "./manifest";
import type { DesignDocument } from "./model";
import { isRawFigHeader } from "./probe";
import { parseSketchDocument } from "./sketch-parser";
import { mountDesignSourceViewer } from "./viewer-ui";

const MAX_FILE_BYTES = 128 * 1024 * 1024;

function detectFormat(fileName: string, bytes: Uint8Array): "figma" | "sketch" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".fig") || isRawFigHeader(bytes)) return "figma";
  if (lower.endsWith(".sketch")) return "sketch";
  throw new ViewerError("invalid-file", "Unsupported design file extension");
}

export const designSourceViewer: FileViewerPlugin = {
  manifest: designSourceManifest,
  async open(context: OpenViewerContext): Promise<ViewerController> {
    const { file, container, signal, locale, reportProgress, reportPreview } = context;
    const messages = getMessages(locale);

    if (signal.aborted) throw abortError();
    if (file.size === 0) {
      throw new ViewerError("invalid-file", messages.invalidFile);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ViewerError("resource-limit", messages.resourceLimit);
    }

    reportProgress({
      stage: "read",
      message: messages.loadingReading,
      loaded: 0,
      total: file.size,
    });

    const bytes = await readBlob(file, signal);
    if (signal.aborted) throw abortError();

    reportProgress({
      stage: "parse",
      message: messages.loadingParsing,
      loaded: file.size,
      total: file.size,
    });

    let doc: DesignDocument;
    try {
      const format = detectFormat(file.name, bytes);
      doc =
        format === "figma"
          ? parseFigmaDocument(bytes, file.name)
          : parseSketchDocument(bytes, file.name);
    } catch (error) {
      if (error instanceof ViewerError) {
        if (error.code === "resource-limit") {
          throw new ViewerError("resource-limit", messages.resourceLimit, { cause: error });
        }
        throw new ViewerError("invalid-file", messages.invalidFile, { cause: error });
      }
      throw new ViewerError("invalid-file", messages.invalidFile, { cause: error });
    }

    if (signal.aborted) throw abortError();

    if (doc.pages.length === 0 && !doc.thumbnail) {
      throw new ViewerError("invalid-file", messages.invalidFile);
    }

    reportProgress({ stage: "render", message: messages.loadingRendering });

    const instance = mountDesignSourceViewer(doc, messages, signal);
    if (signal.aborted) {
      instance.dispose();
      throw abortError();
    }

    container.append(instance.root);
    reportPreview?.({ outcome: "success", kind: "static" });

    return {
      dispose() {
        instance.dispose();
      },
    };
  },
};

export { designSourceManifest };
export { parseFigmaDocument } from "./figma-parser";
export { parseSketchDocument } from "./sketch-parser";
