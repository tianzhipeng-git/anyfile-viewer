import {
  AgentError,
  HARD_READ_MAX_BYTES,
  abortError,
  isViewerAbortError,
  paginateLines,
  paginateText,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";

import { IwaLimitError } from "./iwa";
import { detectIworkLayout, iworkAppFromName, previewPath } from "./layout";
import { buildIworkModel } from "./load";
import type { IworkModel, IworkSection } from "./model";
import { IworkPackage, PackageEncryptedError, PackageLimitError } from "./package";

const PLUGIN_ID = "iwork";
const TITLE_CHARS = 80;

interface TextSection {
  readonly target: TargetEntry;
  readonly markdown: string;
}

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof PackageEncryptedError) {
    throw new AgentError("encrypted-file", "Password-protected iWork documents are not supported.", { pluginId: PLUGIN_ID, cause: error });
  }
  if (error instanceof PackageLimitError || error instanceof IwaLimitError) {
    throw new AgentError("resource-limit", "The iWork document exceeds safety limits.", { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable Pages or Keynote document.", { pluginId: PLUGIN_ID, cause: error });
}

async function loadModel(context: ExtractContext) {
  if (context.signal.aborted) throw abortError();
  const app = iworkAppFromName(context.file.name);
  if (!app) throw new AgentError("invalid-file", "Expected a .pages or .key file.", { pluginId: PLUGIN_ID });
  let pkg: IworkPackage | undefined;
  try {
    pkg = await IworkPackage.open(context.file, context.signal);
    const layout = detectIworkLayout(pkg.names, app);
    if (!layout) throw new AgentError("invalid-file", "The file is not a readable Pages or Keynote document.", { pluginId: PLUGIN_ID });
    if (layout.kind === "encrypted") throw new PackageEncryptedError("Password-protected package.");
    const model = await buildIworkModel(pkg, layout, app, context.signal);
    return { model, hasPreview: previewPath(pkg.names, layout.prefix) !== undefined };
  } catch (error) {
    return mapError(error);
  } finally {
    await pkg?.close();
  }
}

function sectionMarkdown(title: string, section: IworkSection) {
  const parts = [`## ${title}`, ...section.paragraphs];
  if (section.notes.length) parts.push("### Presenter notes", ...section.notes);
  return parts.join("\n\n");
}

function textSections(model: IworkModel): TextSection[] {
  let slide = 0;
  return model.sections.map((section) => {
    if (section.role === "slide") {
      slide += 1;
      const heading = section.paragraphs[0]?.replace(/\s+/g, " ").slice(0, TITLE_CHARS);
      const title = heading ? `Slide ${slide}: ${heading}` : `Slide ${slide}`;
      return {
        target: { id: `slide:${slide}`, title, kind: "slide", size: section.paragraphs.length + section.notes.length },
        markdown: sectionMarkdown(`Slide ${slide}`, section),
      };
    }
    const title = section.role === "body" ? "Document text" : "Text boxes";
    return {
      target: { id: section.role, title, kind: "section", size: section.paragraphs.length },
      markdown: sectionMarkdown(title, section),
    };
  });
}

/** Byte-offset paging, or matching lines only when a keyword filter is given. */
function pageText(text: string, params: ReadParams): ReadResult {
  const maxBytes = Math.min(params.maxBytes, HARD_READ_MAX_BYTES);
  const needle = params.filter?.trim().toLowerCase();
  if (!needle) return paginateText(text, params.cursor, maxBytes, "markdown", PLUGIN_ID);
  const lines = text.split("\n").filter((line) => line.toLowerCase().includes(needle));
  const page = paginateLines(lines, params.cursor, maxBytes, PLUGIN_ID);
  return { contentType: "markdown", ...page, filterApplied: true };
}

const iworkExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const { model, hasPreview } = await loadModel(context);
    const sections = textSections(model);
    return {
      metadata: {
        app: model.app,
        generation: model.generation === "iwa" ? "iWork 2013+" : "iWork '09",
        ...(model.app === "keynote" ? { slideCount: sections.length } : {}),
        paragraphCount: model.sections.reduce((sum, section) => sum + section.paragraphs.length, 0),
        noteCount: model.sections.reduce((sum, section) => sum + section.notes.length, 0),
        hasSavedPreview: hasPreview,
        sizeBytes: context.source.size,
      },
      targets: sections.map((section) => section.target),
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const { model } = await loadModel(context);
    const sections = textSections(model);
    let selected = sections;
    if (params.target !== undefined) {
      selected = sections.filter((section) => section.target.id === params.target);
      if (!selected.length) throw new AgentError("target-not-found", `iWork target not found: "${params.target}".`, { pluginId: PLUGIN_ID });
    }
    const text = selected.map((section) => section.markdown).join("\n\n") || "(no text found)";
    return pageText(text, params);
  },
};

export default iworkExtractor;
