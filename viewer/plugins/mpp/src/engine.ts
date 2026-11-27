import { hasOleHeader } from "./probe";
import { INPUT_LIMIT, type ParserError, type ProjectDocument } from "./types";

type GoRuntime = { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> };
type Globals = typeof globalThis & { Go?: new () => GoRuntime; anyfileParseMpp?(bytes: Uint8Array): string };
export type ParseMpp = (bytes: Uint8Array) => string;

export class EngineError extends Error {
  constructor(readonly code: ParserError) { super(code); }
}

/** Starts mppgo after `wasm_exec.js` has defined `globalThis.Go`; returns the exported parser. */
export async function startMppRuntime(wasm: ArrayBuffer | Uint8Array<ArrayBuffer>, onExit: () => void): Promise<ParseMpp> {
  const globals = globalThis as Globals;
  if (!globals.Go) throw new Error("Go runtime glue is missing");
  const go = new globals.Go();
  const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
  void go.run(instance).catch(onExit);
  const parse = globals.anyfileParseMpp;
  if (typeof parse !== "function") throw new Error("Runtime initialization failed");
  return parse;
}

export function parseProject(parse: ParseMpp, bytes: Uint8Array): ProjectDocument {
  if (bytes.byteLength > INPUT_LIMIT) throw new EngineError("resource-limit");
  if (!hasOleHeader(bytes)) throw new EngineError("invalid-file");
  const parsed = JSON.parse(parse(bytes)) as ProjectDocument | { error: ParserError };
  if ("error" in parsed) throw new EngineError(parsed.error);
  return parsed;
}
