import { importRuntime } from "@anyfile/runtime-assets";
import {
  AgentError,
  abortError,
  paginateText,
  parsePositionCursor,
  renderMarkdownTablePage,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";
import { createStatEngine, EngineError, type ReadAt, type ReadStatModule } from "./engine";
import { createValueFormatter } from "./format-value";
import { detectStatFormat, readHeader } from "./probe";
import { RUNTIME_BASE, type StatFormat, type StatSchema } from "./types";

const PLUGIN_ID = "statistical-data";
/** Vendor path of the same ReadStat build the Web viewer loads from `/vendor/`. */
const VENDOR_DIR = RUNTIME_BASE.replace(/^\/vendor\//, "");
const ROW_CHUNK = 200;
const MAX_SCAN_ROWS = 10_000;

type Runtime = { readonly readstat: ReadStatModule; setReader(reader: ReadAt): void };
let runtime: Promise<Runtime> | undefined;

/** One ReadStat instance per worker; each call points its `readAt` at the current `BinarySource`. */
function loadRuntime(context: ExtractContext): Promise<Runtime> {
  runtime ??= (async () => {
    let reader: ReadAt = () => 0;
    const { default: create } = await importRuntime<{ default(options: Record<string, unknown>): Promise<ReadStatModule> }>(
      await context.vendor.url(`${VENDOR_DIR}readstat.mjs`),
    );
    const readstat = await create({
      wasmBinary: await context.vendor.bytes(`${VENDOR_DIR}readstat.wasm`),
      readAt: (position: number, target: Uint8Array) => reader(position, target),
      print: () => {},
      printErr: () => {},
    });
    return { readstat, setReader(next: ReadAt) { reader = next; } };
  })().catch((error: unknown) => {
    runtime = undefined;
    throw new AgentError("runtime-unavailable", `ReadStat runtime failed to load: ${error instanceof Error ? error.message : String(error)}`, { pluginId: PLUGIN_ID, cause: error });
  });
  return runtime;
}

function engineError(error: unknown): never {
  if (error instanceof EngineError) {
    throw new AgentError(error.code === "resource-limit" ? "resource-limit" : "invalid-file", `ReadStat could not read this file (${error.code}).`, { pluginId: PLUGIN_ID, cause: error });
  }
  throw error;
}

async function openTable(context: ExtractContext) {
  if (context.signal.aborted) throw abortError();
  const format = detectStatFormat(await readHeader(context.file, context.signal));
  if (!format) throw new AgentError("invalid-file", "Not an SPSS, Stata, SAS or SAS transport file.", { pluginId: PLUGIN_ID });
  const { readstat, setReader } = await loadRuntime(context);
  const engine = createStatEngine(readstat, format, context.source.size);
  // ReadStat runs synchronously; re-point the reader before every engine call.
  const withSource = <T>(run: () => T): T => {
    setReader((position, target) => context.source.readSync(position, target));
    try { return run(); } catch (error) { engineError(error); }
  };
  const schema = withSource(() => engine.schema());
  return { format, schema, rows: (offset: number, limit: number) => withSource(() => engine.rows(offset, limit, 0, schema.variables.length)) };
}

function targets(schema: StatSchema): TargetEntry[] {
  return [
    { id: "data", title: "Data", kind: "table", ...(schema.meta.rows >= 0 ? { size: schema.meta.rows } : {}) },
    { id: "variables", title: "Variables", kind: "table", size: schema.variables.length },
    ...(schema.labels.length ? [{ id: "value-labels", title: "Value labels", kind: "table", size: schema.labels.length }] : []),
    ...(schema.notes.length ? [{ id: "notes", title: "Notes", kind: "text", size: schema.notes.length }] : []),
  ];
}

const isoTime = (seconds: number) => (seconds > 0 ? new Date(seconds * 1000).toISOString() : null);

function staticTable(columns: string[], rows: string[][], params: ReadParams): ReadResult {
  const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
  const needle = params.filter?.trim().toLowerCase();
  const result = renderMarkdownTablePage({
    columns,
    rows: rows.slice(start).map((row) => (!needle || row.some((cell) => cell.toLowerCase().includes(needle)) ? row : null)),
    start,
    maxBytes: params.maxBytes,
    cursorPrefix: "row:",
  });
  return needle ? { ...result, filterApplied: true } : result;
}

function readData(table: Awaited<ReturnType<typeof openTable>>, format: StatFormat, params: ReadParams): ReadResult {
  const { schema } = table;
  const formatter = createValueFormatter(format, schema);
  const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
  const needle = params.filter?.trim().toLowerCase();
  let exhausted = false;
  function* rows() {
    for (let offset = start; offset < start + MAX_SCAN_ROWS; offset += ROW_CHUNK) {
      const chunk = table.rows(offset, Math.min(ROW_CHUNK, start + MAX_SCAN_ROWS - offset));
      for (const values of chunk) {
        const cells = values.map((value, index) => formatter.cell(schema.variables[index], value));
        yield !needle || cells.some((cell) => cell.toLowerCase().includes(needle)) ? cells : null;
      }
      if (chunk.length < ROW_CHUNK) {
        exhausted = true;
        return;
      }
    }
  }
  const result = renderMarkdownTablePage({
    columns: schema.variables.map(({ name }) => name),
    rows: rows(),
    start,
    maxBytes: params.maxBytes,
    cursorPrefix: "row:",
    hasMoreAfter: () => !exhausted,
  });
  return needle ? { ...result, filterApplied: true } : result;
}

const statDataExtractor: StructuredExtractor = {
  async inspect(context): Promise<InspectPayload> {
    const { format, schema } = await openTable(context);
    const { meta } = schema;
    return {
      metadata: {
        format,
        rows: meta.rows >= 0 ? meta.rows : null,
        variables: meta.variables,
        label: meta.label || null,
        table: meta.table || null,
        encoding: meta.encoding || null,
        created: isoTime(meta.created),
        modified: isoTime(meta.modified),
        incomplete: schema.incomplete ?? false,
      },
      targets: targets(schema),
    };
  },

  async read(context, params): Promise<ReadResult> {
    const table = await openTable(context);
    const { format, schema } = table;
    const target = params.target ?? "data";
    if (target === "data") return readData(table, format, params);
    if (target === "variables") {
      return staticTable(
        ["Name", "Label", "Format", "Type", "Value labels"],
        schema.variables.map((v) => [v.name, v.label, v.format, v.string ? "string" : "numeric", v.labels]),
        params,
      );
    }
    if (target === "value-labels" && schema.labels.length) {
      const formatter = createValueFormatter(format, schema);
      return staticTable(
        ["Label set", "Value", "Label"],
        schema.labels.flatMap((set) => set.values.map(([value, label]) => [set.name, formatter.plain(value), label])),
        params,
      );
    }
    if (target === "notes" && schema.notes.length) {
      return paginateText(schema.notes.join("\n\n"), params.cursor, params.maxBytes, "text", PLUGIN_ID);
    }
    throw new AgentError("target-not-found", `Unknown statistical data target: "${target}".`, { pluginId: PLUGIN_ID });
  },
};

export default statDataExtractor;
