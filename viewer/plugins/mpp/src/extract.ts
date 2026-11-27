import { importRuntime } from "@anyfile/runtime-assets";
import {
  AgentError,
  abortError,
  isViewerAbortError,
  parsePositionCursor,
  renderMarkdownTablePage,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";
import { EngineError, parseProject, startMppRuntime, type ParseMpp } from "./engine";
import { INPUT_LIMIT, RUNTIME_BASE, RUNTIME_FILES, type Duration, type ProjectDocument, type Task } from "./types";

const PLUGIN_ID = "microsoft-project";
/** Vendor path of the same mppgo build the Web viewer loads from `/vendor/`. */
const VENDOR_DIR = RUNTIME_BASE.replace(/^\/vendor\//, "");

let runtime: Promise<ParseMpp> | undefined;

/** One Go runtime per worker; `wasm_exec.js` installs `globalThis.Go` and mppgo exports its parser. */
function loadRuntime(context: ExtractContext): Promise<ParseMpp> {
  runtime ??= (async () => {
    await importRuntime(await context.vendor.url(`${VENDOR_DIR}${RUNTIME_FILES.glue}`));
    const wasm = await context.vendor.bytes(`${VENDOR_DIR}${RUNTIME_FILES.wasm}`);
    return startMppRuntime(new Uint8Array(wasm), () => { runtime = undefined; });
  })().catch((error: unknown) => {
    runtime = undefined;
    throw new AgentError("runtime-unavailable", `mppgo runtime failed to load: ${error instanceof Error ? error.message : String(error)}`, { pluginId: PLUGIN_ID, cause: error });
  });
  return runtime;
}

const ENGINE_ERRORS = {
  "invalid-file": ["invalid-file", "The file is damaged or is not a valid MPP project."],
  "resource-limit": ["resource-limit", "The project exceeds the MPP size or parsing limits."],
  "password-required": ["encrypted-file", "Password-protected MPP files are not supported."],
  "unsupported-format": ["invalid-file", "Only MPP14 files saved by Project 2010 or later are supported."],
  "unsupported-environment": ["runtime-unavailable", "The mppgo runtime stopped unexpectedly."],
} as const;

async function openProject(context: ExtractContext): Promise<ProjectDocument> {
  if (context.signal.aborted) throw abortError();
  const { source } = context;
  if (source.size > INPUT_LIMIT) throw new AgentError("resource-limit", ENGINE_ERRORS["resource-limit"][1], { pluginId: PLUGIN_ID });
  const parse = await loadRuntime(context);
  const bytes = await source.read(0, source.size, context.signal);
  if (context.signal.aborted) throw abortError();
  try {
    return parseProject(parse, bytes);
  } catch (error) {
    if (isViewerAbortError(error)) throw error;
    const [code, message] = ENGINE_ERRORS[error instanceof EngineError ? error.code : "invalid-file"];
    throw new AgentError(code, message, { pluginId: PLUGIN_ID, cause: error });
  }
}

const date = (value: string | null) => (value ? value.replace("T", " ").replace(/:00$/, "") : "");
const duration = ({ amount, unit }: Duration) => `${Number(amount.toFixed(2))}${unit}`;
const predecessors = (task: Task) =>
  task.predecessors.map(({ id, type, lag }) => `${id}${type}${lag.amount ? `${lag.amount > 0 ? "+" : ""}${duration(lag)}` : ""}`).join(", ");
const flags = (task: Task) =>
  [task.summary && "summary", task.milestone && "milestone", task.inactive && "inactive"].filter(Boolean).join(", ");

function assignments(project: ProjectDocument): string[][] {
  return project.tasks.flatMap((task) => task.resources.map((resource) => [String(task.id), task.name, resource]));
}

/** Earliest start and latest finish over active tasks; ISO strings sort chronologically. */
function span(tasks: readonly Task[]) {
  let start: string | null = null, finish: string | null = null;
  for (const task of tasks) {
    if (task.inactive) continue;
    if (task.start && (!start || task.start < start)) start = task.start;
    if (task.finish && (!finish || task.finish > finish)) finish = task.finish;
  }
  return { start, finish };
}

function table(columns: string[], rows: string[][], params: ReadParams): ReadResult {
  const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
  if (start > rows.length) throw new AgentError("target-not-found", `Cursor row ${start} is out of range.`, { pluginId: PLUGIN_ID });
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

const mppExtractor: StructuredExtractor = {
  async inspect(context): Promise<InspectPayload> {
    const project = await openProject(context);
    const { tasks, resources } = project;
    const assigned = assignments(project).length;
    return {
      metadata: {
        name: project.name || null,
        tasks: tasks.length,
        summaryTasks: tasks.filter((task) => task.summary).length,
        milestones: tasks.filter((task) => task.milestone).length,
        resources: resources.length,
        assignments: assigned,
        ...span(tasks),
      },
      targets: [
        { id: "tasks", title: "Tasks", kind: "table", size: tasks.length },
        { id: "resources", title: "Resources", kind: "table", size: resources.length },
        { id: "assignments", title: "Resource assignments", kind: "table", size: assigned },
      ],
    };
  },

  async read(context, params): Promise<ReadResult> {
    const project = await openProject(context);
    const target = params.target ?? (project.tasks.length || !project.resources.length ? "tasks" : "resources");
    if (target === "tasks") {
      return table(
        ["ID", "WBS", "Level", "Name", "Start", "Finish", "Duration", "% Complete", "Predecessors", "Resources", "Flags", "Notes"],
        project.tasks.map((task) => [
          String(task.id), task.wbs, String(task.level), task.name, date(task.start), date(task.finish), duration(task.duration),
          `${task.complete}%`, predecessors(task), task.resources.join(", "), flags(task), task.notes,
        ]),
        params,
      );
    }
    if (target === "resources") {
      return table(
        ["ID", "Name", "Type", "Group", "Max units", "Notes"],
        project.resources.map((resource) => [String(resource.id), resource.name, resource.type, resource.group, resource.type === "Work" ? `${resource.maxUnits}%` : "", resource.notes]),
        params,
      );
    }
    if (target === "assignments") return table(["Task ID", "Task", "Resource"], assignments(project), params);
    throw new AgentError("target-not-found", `Unknown Microsoft Project target: "${target}".`, { pluginId: PLUGIN_ID });
  },
};

export default mppExtractor;
