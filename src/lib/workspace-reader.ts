import type { WorkspaceReader } from "@anyfile/viewer-protocol";

import type { WorkspaceTreeEntry } from "./file-system-access";

function abortIfRequested(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("读取已取消。", "AbortError");
}

function validateRelativePath(path: string, allowEmpty: boolean) {
  if ((!allowEmpty && !path) || path.startsWith("/") || path.includes("\\")) {
    throw new TypeError("工作区路径必须是使用 / 分隔的相对路径。");
  }
  if (path && path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new TypeError("工作区路径不能包含空段、. 或 ..。");
  }
}

function parentPath(path: string) {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "" : path.slice(0, separator);
}

function joinPath(base: string, relativePath: string) {
  return base && relativePath ? `${base}/${relativePath}` : base || relativePath;
}

export function createWorkspaceReader(
  entries: readonly WorkspaceTreeEntry[],
  currentFile: WorkspaceTreeEntry | undefined,
): WorkspaceReader | undefined {
  if (
    currentFile?.kind !== "file" ||
    currentFile.relativePath === undefined ||
    !currentFile.handle
  ) {
    return undefined;
  }

  const baseDirectory = parentPath(currentFile.relativePath);
  const entriesByPath = new Map(
    entries
      .filter((entry) => entry.relativePath !== undefined)
      .map((entry) => [entry.relativePath!, entry]),
  );

  return {
    async open(relativePath, options) {
      abortIfRequested(options?.signal);
      validateRelativePath(relativePath, false);
      const entry = entriesByPath.get(joinPath(baseDirectory, relativePath));
      if (entry?.kind !== "file" || !entry.handle) return null;
      const file = await entry.handle.getFile();
      abortIfRequested(options?.signal);
      return file;
    },

    async *list(relativeDirectory = "", options) {
      abortIfRequested(options?.signal);
      validateRelativePath(relativeDirectory, true);
      const targetDirectory = joinPath(baseDirectory, relativeDirectory);

      for (const entry of entries) {
        abortIfRequested(options?.signal);
        if (entry.relativePath === undefined || parentPath(entry.relativePath) !== targetDirectory) continue;
        const relativePath = baseDirectory
          ? entry.relativePath.slice(baseDirectory.length + 1)
          : entry.relativePath;
        yield { name: entry.name, relativePath, kind: entry.kind };
      }
    },
  };
}
