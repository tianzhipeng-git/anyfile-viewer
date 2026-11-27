import { INPUT_LIMIT } from "./types";

/** Exports of `visio.mjs` built by `tools/libvisio-build`. */
export type VisioModule = { setIcuData(bytes: Uint8Array): void; openVisio(bytes: Uint8Array): number; pageSvg(index: number): string };
export type EngineErrorCode = "invalid-file" | "resource-limit";

export class EngineError extends Error {
  constructor(readonly code: EngineErrorCode) { super(code); }
}

const MAX_PAGES = 512;
const MAX_SVG_LENGTH = 16 * 1024 * 1024;

/** Loads a drawing into the (stateful) module and returns its page count. */
export function openDrawing(module: VisioModule, bytes: Uint8Array): number {
  if (bytes.byteLength > INPUT_LIMIT) throw new EngineError("resource-limit");
  const pages = module.openVisio(bytes);
  if (!pages) throw new EngineError("invalid-file");
  if (pages < 0 || pages > MAX_PAGES) throw new EngineError("resource-limit");
  return pages;
}

/** SVG of one page of the drawing last passed to `openDrawing`. */
export function pageSvg(module: VisioModule, index: number): string {
  const svg = module.pageSvg(index);
  if (svg.length > MAX_SVG_LENGTH) throw new EngineError("resource-limit");
  if (!svg) throw new EngineError("invalid-file");
  return svg;
}
