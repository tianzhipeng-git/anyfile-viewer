import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { readBlob } from "./read-blob";

const PDF_HEADER_BYTES = 1_024;

export async function probePdf(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  const header = new TextDecoder("latin1").decode(
    await readBlob(file.slice(0, PDF_HEADER_BYTES), signal),
  );
  return header.includes("%PDF-") ? 4 : 0;
}
