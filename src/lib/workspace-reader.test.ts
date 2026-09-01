import { describe, expect, it, vi } from "vitest";

import type { WorkspaceTreeEntry } from "./file-system-access";
import { createMemoryWorkspaceReader, createWorkspaceReader, duplicateWorkspaceFileName } from "./workspace-reader";

function fileEntry(relativePath: string, contents: string): WorkspaceTreeEntry {
  const file = new File([contents], relativePath.split("/").at(-1)!);
  return {
    id: `file:${relativePath}`,
    name: file.name,
    displayPath: relativePath,
    relativePath,
    depth: relativePath.split("/").length,
    kind: "file",
    handle: { kind: "file", name: file.name, getFile: vi.fn(async () => file) } as unknown as FileSystemFileHandle,
  };
}

type MockTree = { [name: string]: string | MockTree };

function directoryHandle(name: string, tree: MockTree): FileSystemDirectoryHandle {
  const children = new Map<string, FileSystemHandle>();
  for (const [childName, child] of Object.entries(tree)) {
    children.set(
      childName,
      typeof child === "string"
        ? {
            kind: "file",
            name: childName,
            getFile: vi.fn(async () => new File([child], childName)),
          } as unknown as FileSystemFileHandle
        : directoryHandle(childName, child),
    );
  }

  function missing(): never {
    throw new DOMException("Not found", "NotFoundError");
  }

  return {
    kind: "directory",
    name,
    getDirectoryHandle: vi.fn(async (childName: string) => {
      const child = children.get(childName);
      return child?.kind === "directory" ? child as FileSystemDirectoryHandle : missing();
    }),
    getFileHandle: vi.fn(async (childName: string) => {
      const child = children.get(childName);
      return child?.kind === "file" ? child as FileSystemFileHandle : missing();
    }),
    async *entries() {
      yield* children.entries();
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("workspace reader", () => {
  const current = fileEntry("models/car/model.obj", "model");
  const root = directoryHandle("workspace", {
    models: {
      car: {
        "model.obj": "model",
        "model.mtl": "material",
        textures: { "base.png": "texture" },
      },
      shared: { "secret.bin": "secret" },
    },
  });

  it("opens files relative to the current file directory", async () => {
    const reader = createWorkspaceReader(root, current)!;

    await expect(reader.open("model.mtl")).resolves.toMatchObject({ name: "model.mtl" });
    await expect(reader.open("textures/base.png")).resolves.toMatchObject({ name: "base.png" });
    await expect(reader.open("missing.bin")).resolves.toBeNull();
  });

  it("rejects absolute paths, backslashes, and traversal", async () => {
    const reader = createWorkspaceReader(root, current)!;

    await expect(reader.open("/etc/passwd")).rejects.toBeInstanceOf(TypeError);
    await expect(reader.open("../shared/secret.bin")).rejects.toBeInstanceOf(TypeError);
    await expect(reader.open("textures\\base.png")).rejects.toBeInstanceOf(TypeError);
  });

  it("lists direct entries lazily and respects cancellation", async () => {
    const reader = createWorkspaceReader(root, current)!;
    const listed = [];
    for await (const entry of reader.list()) listed.push(entry);

    expect(listed).toEqual([
      { name: "model.obj", relativePath: "model.obj", kind: "file" },
      { name: "model.mtl", relativePath: "model.mtl", kind: "file" },
      { name: "textures", relativePath: "textures", kind: "directory" },
    ]);

    const abortController = new AbortController();
    abortController.abort();
    await expect(reader.open("model.mtl", { signal: abortController.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("is unavailable for files not opened from a directory workspace", () => {
    expect(createWorkspaceReader(undefined, { ...current, relativePath: undefined })).toBeUndefined();
  });

  it("exposes one multi-file selection as a flat read-only workspace", async () => {
    const first = { ...fileEntry("front.insv", "front"), file: new File(["front"], "front.insv"), handle: undefined } as WorkspaceTreeEntry;
    const second = { ...fileEntry("back.insv", "back"), file: new File(["back"], "back.insv"), handle: undefined } as WorkspaceTreeEntry;
    const reader = createMemoryWorkspaceReader([first, second], first)!;

    await expect(reader.open("back.insv")).resolves.toMatchObject({ name: "back.insv" });
    await expect(reader.open("nested/back.insv")).resolves.toBeNull();
    const listed = [];
    for await (const entry of reader.list()) listed.push(entry);
    expect(listed.map((entry) => entry.name)).toEqual(["front.insv", "back.insv"]);
  });

  it("does not create a memory workspace for one file or ambiguous names", () => {
    const first = fileEntry("clip.insv", "first");
    const duplicate = fileEntry("CLIP.INSV", "second");
    expect(createMemoryWorkspaceReader([first], first)).toBeUndefined();
    expect(duplicateWorkspaceFileName([first, duplicate])).toBe("CLIP.INSV");
    expect(createMemoryWorkspaceReader([first, duplicate], first)).toBeUndefined();
  });
});
