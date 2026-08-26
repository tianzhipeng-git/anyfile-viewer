import { describe, expect, it, vi } from "vitest";

import { directoryHandleChildren, directoryHandleEntries } from "./file-system-access";

function directoryHandle(
  name: string,
  children: Array<[string, FileSystemHandle]>,
): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    entries: vi.fn(async function* () {
      yield* children;
    }),
  } as unknown as FileSystemDirectoryHandle;
}

describe("directory handles", () => {
  it("only reads the root directory when opening a workspace", async () => {
    const nested = directoryHandle("nested", [[
      "deep.txt",
      { kind: "file", name: "deep.txt" } as FileSystemFileHandle,
    ]]);
    const root = directoryHandle("workspace", [
      ["top.txt", { kind: "file", name: "top.txt" } as FileSystemFileHandle],
      ["nested", nested],
    ]);

    const entries = await directoryHandleEntries(root);

    expect(entries.map((entry) => entry.relativePath)).toEqual(["", "nested", "top.txt"]);
    expect(root.entries).toHaveBeenCalledOnce();
    expect(nested.entries).not.toHaveBeenCalled();
  });

  it("reads one directory level when that directory is expanded", async () => {
    const nested = directoryHandle("nested", [[
      "deep.txt",
      { kind: "file", name: "deep.txt" } as FileSystemFileHandle,
    ]]);

    const children = await directoryHandleChildren({
      id: "directory:workspace/nested",
      name: "nested",
      displayPath: "workspace/nested",
      relativePath: "nested",
      depth: 1,
      kind: "directory",
      handle: nested,
      childrenLoaded: false,
    });

    expect(children.map((entry) => entry.relativePath)).toEqual(["nested/deep.txt"]);
    expect(nested.entries).toHaveBeenCalledOnce();
  });
});
