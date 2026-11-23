import { STAT_FORMATS, type ErrorCode, type StatFormat, type StatSchema, type StatValue } from "./types";

/** Exports of `readstat.mjs` built by `tools/readstat-build`. */
export type ReadStatModule = {
  readonly HEAPU8: Uint8Array;
  _rs_schema(format: number, size: number): number;
  _rs_rows(format: number, size: number, offset: number, limit: number, firstColumn: number, lastColumn: number): number;
  _rs_output(): number;
  _rs_output_length(): number;
};
/** Copies bytes at `position` into `target`; returns the count copied (0 at end of input). */
export type ReadAt = (position: number, target: Uint8Array) => number;

export class EngineError extends Error {
  constructor(readonly code: ErrorCode) { super(code); }
}

const STATUS: Record<number, ErrorCode> = { 1: "invalid-file", 2: "resource-limit", 3: "invalid-file" };
const decoder = new TextDecoder();

export function createStatEngine(module: ReadStatModule, format: StatFormat, size: number) {
  const id = STAT_FORMATS[format];
  const output = <T>(status: number): T => {
    if (status !== 0) throw new EngineError(STATUS[status] ?? "invalid-file");
    const start = module._rs_output();
    return JSON.parse(decoder.decode(module.HEAPU8.subarray(start, start + module._rs_output_length()))) as T;
  };
  return {
    schema(): StatSchema {
      const schema = output<StatSchema>(module._rs_schema(id, size));
      if (!schema.meta || schema.variables.length === 0) throw new EngineError("invalid-file");
      return schema;
    },
    rows(offset: number, limit: number, firstColumn: number, lastColumn: number): StatValue[][] {
      return output<StatValue[][]>(module._rs_rows(id, size, offset, limit, firstColumn, lastColumn));
    },
  };
}
