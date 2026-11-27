import { readdir, realpath, stat } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { AgentError, abortError, type WorkspaceEntry, type WorkspaceReader } from "@anyfile/viewer-protocol";
import { openDiskFile } from "./disk-io";

function isWithinRoot(targetPath: string, rootPath: string): boolean {
  const prefix = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
  return targetPath === rootPath || targetPath.startsWith(prefix);
}

export async function normalizeAllowedRoots(roots: readonly string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const root of roots) {
    try {
      resolved.push(await realpath(resolve(root)));
    } catch {
      // Ignore non-existent configured roots; checks against empty list deny access.
    }
  }
  return resolved;
}

/** Whether an already-resolved real path lies inside one of the allowed roots. */
export async function isWithinAllowedRoots(realPath: string, allowedRoots: readonly string[]): Promise<boolean> {
  return (await normalizeAllowedRoots(allowedRoots)).some((root) => isWithinRoot(realPath, root));
}

/**
 * Resolves `inputPath` via `realpath` and verifies it is an existing regular file
 * inside at least one of `allowedRoots`. Blocks `..` traversal and symlink escapes.
 */
export async function resolveAllowedFile(
  inputPath: string,
  allowedRoots: readonly string[],
): Promise<{ readonly realPath: string; readonly size: number; readonly mtimeMs: number }> {
  if (!inputPath || inputPath.includes("\0")) {
    throw new AgentError("access-denied", "Invalid file path.");
  }

  let realPath: string;
  try {
    realPath = await realpath(resolve(inputPath));
  } catch {
    throw new AgentError("access-denied", `Path does not exist or is not accessible: ${inputPath}`);
  }

  if (!(await isWithinAllowedRoots(realPath, allowedRoots))) {
    throw new AgentError("access-denied", "Path is outside the allowed directories.");
  }

  let info;
  try {
    info = await stat(realPath);
  } catch {
    throw new AgentError("access-denied", "Unable to inspect file metadata.");
  }
  if (!info.isFile()) {
    throw new AgentError("access-denied", "Target path is not a regular file.");
  }

  return { realPath, size: info.size, mtimeMs: info.mtimeMs };
}

function normalizeRelativeSegmentPath(relativePath: string): string | null {
  const cleaned = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (cleaned.includes("\0")) return null;
  const parts = cleaned.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) return null;
  return parts.join("/");
}

/**
 * Read-only `WorkspaceReader` rooted at `rootDir` (typically the parent directory of the main file).
 * Every open/list operation resolves `realpath` and verifies containment inside `rootDir`.
 */
export function createDiskWorkspaceReader(rootDir: string): WorkspaceReader {
  const rootPromise = realpath(resolve(rootDir));

  return {
    async open(relativePath: string, options?: { signal?: AbortSignal }): Promise<File | null> {
      if (options?.signal?.aborted) throw abortError();
      const safeRel = normalizeRelativeSegmentPath(relativePath);
      if (safeRel === null || safeRel.length === 0) return null;

      const realRoot = await rootPromise;
      const candidate = resolve(realRoot, safeRel);
      let realCandidate: string;
      try {
        realCandidate = await realpath(candidate);
      } catch {
        return null;
      }
      if (!isWithinRoot(realCandidate, realRoot)) return null;

      try {
        const info = await stat(realCandidate);
        if (!info.isFile()) return null;
        return await openDiskFile(realCandidate, basename(realCandidate), info.mtimeMs);
      } catch {
        return null;
      }
    },

    async *list(relativeDirectory = "", options?: { signal?: AbortSignal }): AsyncIterable<WorkspaceEntry> {
      if (options?.signal?.aborted) throw abortError();
      const safeRel = normalizeRelativeSegmentPath(relativeDirectory);
      if (safeRel === null) return;

      const realRoot = await rootPromise;
      const targetDir = safeRel ? resolve(realRoot, safeRel) : realRoot;
      let realTargetDir: string;
      try {
        realTargetDir = await realpath(targetDir);
      } catch {
        return;
      }
      if (!isWithinRoot(realTargetDir, realRoot)) return;

      let entries;
      try {
        entries = await readdir(realTargetDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (options?.signal?.aborted) throw abortError();
        const entryFull = join(realTargetDir, entry.name);
        let realEntry: string;
        try {
          realEntry = await realpath(entryFull);
        } catch {
          continue;
        }
        if (!isWithinRoot(realEntry, realRoot)) continue;
        const entryStat = await stat(realEntry).catch(() => null);
        if (!entryStat) continue;
        const kind = entryStat.isDirectory() ? "directory" : entryStat.isFile() ? "file" : null;
        if (!kind) continue;
        yield {
          name: entry.name,
          relativePath: safeRel ? `${safeRel}/${entry.name}` : entry.name,
          kind,
        };
      }
    },
  };
}
