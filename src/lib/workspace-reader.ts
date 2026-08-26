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
  rootDirectory: FileSystemDirectoryHandle | undefined,
  currentFile: WorkspaceTreeEntry | undefined,
): WorkspaceReader | undefined {
  if (
    !rootDirectory ||
    currentFile?.kind !== "file" ||
    currentFile.relativePath === undefined ||
    !currentFile.handle
  ) {
    return undefined;
  }

  const baseDirectory = parentPath(currentFile.relativePath);
  async function resolveDirectory(path: string, signal?: AbortSignal) {
    let directory = rootDirectory!;
    for (const segment of path.split("/").filter(Boolean)) {
      abortIfRequested(signal);
      directory = await directory.getDirectoryHandle(segment);
    }
    return directory;
  }

  function isMissingEntry(error: unknown) {
    return error instanceof DOMException && (error.name === "NotFoundError" || error.name === "TypeMismatchError");
  }

  return {
    async open(relativePath, options) {
      abortIfRequested(options?.signal);
      validateRelativePath(relativePath, false);
      const path = joinPath(baseDirectory, relativePath);
      const segments = path.split("/");
      const fileName = segments.pop()!;
      try {
        const directory = await resolveDirectory(segments.join("/"), options?.signal);
        const file = await (await directory.getFileHandle(fileName)).getFile();
        abortIfRequested(options?.signal);
        return file;
      } catch (error) {
        if (isMissingEntry(error)) return null;
        throw error;
      }
    },

    async *list(relativeDirectory = "", options) {
      abortIfRequested(options?.signal);
      validateRelativePath(relativeDirectory, true);
      let directory: FileSystemDirectoryHandle;
      try {
        directory = await resolveDirectory(joinPath(baseDirectory, relativeDirectory), options?.signal);
      } catch (error) {
        if (isMissingEntry(error)) return;
        throw error;
      }
      for await (const [name, handle] of directory.entries()) {
        abortIfRequested(options?.signal);
        yield {
          name,
          relativePath: relativeDirectory ? `${relativeDirectory}/${name}` : name,
          kind: handle.kind,
        };
      }
    },
  };
}
