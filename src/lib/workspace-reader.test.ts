import { describe, expect, it, vi } from "vitest";

import type { WorkspaceTreeEntry } from "./file-system-access";
import { createWorkspaceReader } from "./workspace-reader";

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

function directoryEntry(relativePath: string): WorkspaceTreeEntry {
  return {
    id: `directory:${relativePath}`,
    name: relativePath.split("/").at(-1)!,
    displayPath: relativePath,
    relativePath,
    depth: relativePath.split("/").length,
    kind: "directory",
    handle: { kind: "directory", name: relativePath } as unknown as FileSystemDirectoryHandle,
  };
}

describe("workspace reader", () => {
  const current = fileEntry("models/car/model.obj", "model");
  const material = fileEntry("models/car/model.mtl", "material");
  const textures = directoryEntry("models/car/textures");
  const texture = fileEntry("models/car/textures/base.png", "texture");
  const outside = fileEntry("models/shared/secret.bin", "secret");
  const entries = [current, material, textures, texture, outside];

  it("opens files relative to the current file directory", async () => {
    const reader = createWorkspaceReader(entries, current)!;

    await expect(reader.open("model.mtl")).resolves.toMatchObject({ name: "model.mtl" });
    await expect(reader.open("textures/base.png")).resolves.toMatchObject({ name: "base.png" });
    await expect(reader.open("missing.bin")).resolves.toBeNull();
  });

  it("rejects absolute paths, backslashes, and traversal", async () => {
    const reader = createWorkspaceReader(entries, current)!;

    await expect(reader.open("/etc/passwd")).rejects.toBeInstanceOf(TypeError);
    await expect(reader.open("../shared/secret.bin")).rejects.toBeInstanceOf(TypeError);
    await expect(reader.open("textures\\base.png")).rejects.toBeInstanceOf(TypeError);
  });

  it("lists direct entries lazily and respects cancellation", async () => {
    const reader = createWorkspaceReader(entries, current)!;
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
    expect(createWorkspaceReader([current], { ...current, relativePath: undefined })).toBeUndefined();
  });
});
