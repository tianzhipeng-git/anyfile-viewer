import type { ProbeViewerContext } from "@anyfile/viewer-protocol";

import { parseFontDirectory, type FontContainer } from "./directory";

export interface FontProbe {
  readonly container: FontContainer;
  readonly tables: number;
}

/** The table directory lives in the first kilobytes; table data is never read while probing. */
const HEADER_BYTES = 64 * 1024;

export async function inspectFont({ file, signal }: ProbeViewerContext): Promise<FontProbe | null> {
  signal.throwIfAborted();
  if (file.size < 12) return null;
  const length = Math.min(file.size, HEADER_BYTES);
  const buffer = await file.slice(0, length).arrayBuffer();
  signal.throwIfAborted();
  if (buffer.byteLength !== length) return null;
  const directory = parseFontDirectory(new Uint8Array(buffer), file.size);
  return directory ? { container: directory.container, tables: directory.tables.length } : null;
}

export async function probeFont(context: ProbeViewerContext) {
  return await inspectFont(context) ? 3 : 0;
}
