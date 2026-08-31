type WorkspaceTreeEntryBase = {
  id: string;
  name: string;
  displayPath: string;
  relativePath?: string;
  depth: number;
};

export type WorkspaceTreeEntry = WorkspaceTreeEntryBase & (
  | { kind: "file"; handle: FileSystemFileHandle; file?: never }
  | { kind: "file"; file: File; handle?: never }
  | { kind: "directory"; handle: FileSystemDirectoryHandle; childrenLoaded: boolean }
);

export function browserFileEntries(files: File[]): WorkspaceTreeEntry[] {
  return files.map((file, index) => ({
    id: `browser-file:${index}:${file.name}`,
    name: file.name,
    displayPath: file.name,
    depth: 0,
    kind: "file",
    file,
  }));
}

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
  locale: Locale = "en",
): Promise<WorkspaceTreeEntry[]> {
  const rootEntry: WorkspaceTreeEntry = {
    id: `directory:${root.name}`,
    name: root.name,
    displayPath: root.name,
    relativePath: "",
    depth: 0,
    kind: "directory",
    handle: root,
    childrenLoaded: true,
  };

  return [rootEntry, ...await directoryHandleChildren(rootEntry, locale)];
}

export async function directoryHandleChildren(
  directory: Extract<WorkspaceTreeEntry, { kind: "directory" }>,
  locale: Locale = "en",
): Promise<WorkspaceTreeEntry[]> {
  const children: Array<[string, FileSystemHandle]> = [];
  const result: WorkspaceTreeEntry[] = [];
  const rootName = directory.displayPath.split("/")[0];

  for await (const child of directory.handle.entries()) {
    children.push(child);
  }

  children.sort(([nameA, handleA], [nameB, handleB]) => {
    if (handleA.kind !== handleB.kind) return handleA.kind === "directory" ? -1 : 1;
    return compareText(nameA, nameB, locale);
  });

  for (const [name, handle] of children) {
    const relativePath = directory.relativePath ? `${directory.relativePath}/${name}` : name;
    if (isDirectoryHandle(handle)) {
      result.push({
        id: `directory:${rootName}/${relativePath}`,
        name,
        displayPath: `${rootName}/${relativePath}`,
        relativePath,
        depth: directory.depth + 1,
        kind: "directory",
        handle,
        childrenLoaded: false,
      });
    } else if (isFileHandle(handle)) {
      result.push({
        id: `file:${rootName}/${relativePath}`,
        name,
        displayPath: `${rootName}/${relativePath}`,
        relativePath,
        depth: directory.depth + 1,
        kind: "file",
        handle,
      });
    }
  }

  return result;
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
import { compareText, type Locale } from "@anyfile/i18n";
