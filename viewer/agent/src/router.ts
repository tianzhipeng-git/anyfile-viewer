import {
  abortError,
  findViewerRegistrations,
  isViewerAbortError,
  type ResolvedViewerRegistration,
  type ViewerRegistryEntry,
  type ViewerSupportLevel,
  type WorkspaceReader,
} from "@anyfile/viewer-protocol";
import { viewerRegistryEntries } from "@anyfile/viewer-registry";

export interface RouteResult {
  readonly primary: ResolvedViewerRegistration<ViewerRegistryEntry>;
  readonly candidates: readonly ResolvedViewerRegistration<ViewerRegistryEntry>[];
  readonly matchedBy: "extension" | "magic";
}

function isWildcardOnly(entry: ViewerRegistryEntry): boolean {
  return entry.manifest.formats.every(
    (format) =>
      format.extensions.every((ext) => ext === "*") &&
      (!format.fileNames || format.fileNames.length === 0),
  );
}

function isValidSupportLevel(value: unknown): value is ViewerSupportLevel {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5;
}

function createReadTrackingFile(file: File): { readonly file: File; readonly didRead: () => boolean } {
  let read = false;
  const tracked = new Proxy(file, {
    get(target, prop, receiver) {
      if (prop === "slice" || prop === "arrayBuffer" || prop === "bytes" || prop === "text" || prop === "stream") {
        return (...args: unknown[]) => {
          read = true;
          const fn = Reflect.get(target, prop, target) as (...a: unknown[]) => unknown;
          return fn.apply(target, args);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { file: tracked, didRead: () => read };
}

async function probeCandidates(
  file: File,
  candidates: readonly ViewerRegistryEntry[],
  signal: AbortSignal,
  requireByteInspection = false,
): Promise<ResolvedViewerRegistration<ViewerRegistryEntry>[]> {
  const results = await Promise.all(
    candidates.map(async (registration, index) => {
      let supportLevel: ViewerSupportLevel = registration.probe ? 0 : 1;
      if (registration.probe) {
        const tracker = requireByteInspection ? createReadTrackingFile(file) : null;
        try {
          const level = await registration.probe({ file: tracker ? tracker.file : file, signal });
          if (signal.aborted) throw abortError();
          const inspected = !tracker || tracker.didRead();
          supportLevel = inspected && isValidSupportLevel(level) ? level : 0;
        } catch (error) {
          if (signal.aborted || isViewerAbortError(error)) throw abortError();
          supportLevel = 0;
        }
      }
      return { registration, index, supportLevel };
    }),
  );

  if (signal.aborted) throw abortError();

  return results
    .filter(
      (item): item is typeof item & { supportLevel: Exclude<ViewerSupportLevel, 0> } =>
        item.supportLevel > 0,
    )
    .sort((a, b) => b.supportLevel - a.supportLevel || a.index - b.index)
    .map(({ registration, supportLevel }) => ({ registration, supportLevel }));
}

/**
 * Resolves the best viewer plugin for `file` using the shared `@anyfile/viewer-registry`.
 * 1. Match by filename/extension (excluding wildcard catch-all) and run their probes.
 * 2. If no specific plugin matched (missing or wrong extension), run magic-bytes fallback
 *    probes across all probe-capable plugins and mark `matchedBy: "magic"`.
 * 3. Finally fall back to wildcard catch-all (`hex`) if nothing else matched.
 */
export async function routeFile(
  file: File,
  options: {
    readonly signal: AbortSignal;
    readonly workspace?: WorkspaceReader;
    readonly registrations?: readonly ViewerRegistryEntry[];
  },
): Promise<RouteResult> {
  const { signal, workspace } = options;
  const registrations = options.registrations ?? viewerRegistryEntries;
  if (signal.aborted) throw abortError();

  const workspaceFiltered = registrations.filter(
    ({ manifest }) => manifest.workspaceAccess !== "required" || Boolean(workspace),
  );
  const wildcardEntries = workspaceFiltered.filter(isWildcardOnly);
  const specificMatched = findViewerRegistrations(file.name, workspaceFiltered).filter(
    (entry) => !isWildcardOnly(entry),
  );

  // Step 1: Extension/filename candidates
  const extensionResolved = await probeCandidates(file, specificMatched, signal);
  if (extensionResolved.length > 0) {
    const wildcardResolved = wildcardEntries.map((registration) => ({
      registration,
      supportLevel: 1 as const,
    }));
    const candidates = [...extensionResolved, ...wildcardResolved];
    return { primary: candidates[0], candidates, matchedBy: "extension" };
  }

  // Step 2: Magic-bytes fallback across all probe-capable plugins not already probed
  const alreadyProbed = new Set(specificMatched.map((entry) => entry.manifest.id));
  const magicCandidates = workspaceFiltered.filter(
    (entry) => Boolean(entry.probe) && !alreadyProbed.has(entry.manifest.id) && !isWildcardOnly(entry),
  );
  const magicResolved = await probeCandidates(file, magicCandidates, signal, true);
  if (magicResolved.length > 0) {
    const wildcardResolved = wildcardEntries.map((registration) => ({
      registration,
      supportLevel: 1 as const,
    }));
    const candidates = [...magicResolved, ...wildcardResolved];
    return { primary: candidates[0], candidates, matchedBy: "magic" };
  }

  // Step 3: Wildcard catch-all (e.g. hex)
  const fallback = wildcardEntries.map((registration) => ({
    registration,
    supportLevel: 1 as const,
  }));
  if (fallback.length === 0) {
    throw new Error("No viewer registration matched this file.");
  }
  return { primary: fallback[0], candidates: fallback, matchedBy: "extension" };
}
