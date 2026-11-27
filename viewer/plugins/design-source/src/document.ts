import { ViewerError } from "@anyfile/viewer-protocol";
import { parseFigmaDocument } from "./figma-parser";
import type { DesignDocument } from "./model";
import { isRawFigHeader } from "./probe";
import { parseSketchDocument } from "./sketch-parser";

export const MAX_FILE_BYTES = 128 * 1024 * 1024;

/** Parses a whole `.fig` / `.sketch` file; shared by the browser viewer and the Agent extractor. */
export function parseDesignDocument(bytes: Uint8Array, fileName: string): DesignDocument {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".fig") || isRawFigHeader(bytes)) return parseFigmaDocument(bytes, fileName);
  if (lower.endsWith(".sketch")) return parseSketchDocument(bytes, fileName);
  throw new ViewerError("invalid-file", "Unsupported design file extension");
}
