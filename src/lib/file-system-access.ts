type WorkspaceTreeEntryBase = {
  id: string;
  name: string;
  displayPath: string;
  relativePath?: string;
  depth: number;
};

export type WorkspaceTreeEntry = WorkspaceTreeEntryBase & (
  | { kind: "file"; handle: FileSystemFileHandle }
  | { kind: "directory"; handle: FileSystemDirectoryHandle }
);

export function fileHandleEntries(handles: FileSystemFileHandle[]): WorkspaceTreeEntry[] {
  return handles.map((handle, index) => ({
    id: `file:${index}:${handle.name}`,
    name: handle.name,
    displayPath: handle.name,
    depth: 0,
    kind: "file",
    handle,
  }));
}

function isDirectoryHandle(handle: FileSystemHandle): handle is FileSystemDirectoryHandle {
  return handle.kind === "directory";
}

function isFileHandle(handle: FileSystemHandle): handle is FileSystemFileHandle {
  return handle.kind === "file";
}

export async function directoryHandleEntries(
  root: FileSystemDirectoryHandle,
): Promise<WorkspaceTreeEntry[]> {
  const result: WorkspaceTreeEntry[] = [{
    id: `directory:${root.name}`,
    name: root.name,
    displayPath: root.name,
    relativePath: "",
    depth: 0,
    kind: "directory",
    handle: root,
  }];

  await walkDirectory(root, root.name, "", 1, result);
  return result;
}

async function walkDirectory(
  directory: FileSystemDirectoryHandle,
  rootName: string,
  parentPath: string,
  depth: number,
  result: WorkspaceTreeEntry[],
) {
  const children: Array<[string, FileSystemHandle]> = [];

  for await (const child of directory.entries()) {
    children.push(child);
  }

  children.sort(([nameA, handleA], [nameB, handleB]) => {
    if (handleA.kind !== handleB.kind) return handleA.kind === "directory" ? -1 : 1;
    return nameA.localeCompare(nameB, "zh-CN");
  });

  for (const [name, handle] of children) {
    const relativePath = parentPath ? `${parentPath}/${name}` : name;
    if (isDirectoryHandle(handle)) {
      result.push({
        id: `directory:${rootName}/${relativePath}`,
        name,
        displayPath: `${rootName}/${relativePath}`,
        relativePath,
        depth,
        kind: "directory",
        handle,
      });
      await walkDirectory(handle, rootName, relativePath, depth + 1, result);
    } else if (isFileHandle(handle)) {
      result.push({
        id: `file:${rootName}/${relativePath}`,
        name,
        displayPath: `${rootName}/${relativePath}`,
        relativePath,
        depth,
        kind: "file",
        handle,
      });
    }
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
