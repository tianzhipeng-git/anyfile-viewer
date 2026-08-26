import { describe, expect, it } from "vitest";
import {
  VIEWER_PROTOCOL_VERSION,
  ViewerError,
  findViewerRegistrations,
  normalizeViewerError,
  validateLoadedPlugin,
  validateManifest,
  validateRegistrations,
  type FileViewerPlugin,
  type ViewerPluginManifest,
  type ViewerPluginRegistration,
} from "@anyfile/viewer-protocol";

function manifest(id: string, extensions: readonly string[]): ViewerPluginManifest {
  return {
    protocolVersion: VIEWER_PROTOCOL_VERSION,
    id,
    name: id,
    formats: [{ name: id, extensions }],
    workspaceAccess: "none",
  };
}

function registration(id: string, extensions: readonly string[]): ViewerPluginRegistration {
  const pluginManifest = manifest(id, extensions);
  return {
    manifest: pluginManifest,
    async load() {
      return { manifest: pluginManifest, async open() { return { dispose() {} }; } };
    },
  };
}

describe("viewer protocol", () => {
  it.each(["pdf", ".PDF", "..pdf", ".pdf/zip", ".pdf zip", ".pdf\\zip"])(
    "rejects invalid extension %s",
    (extension) => {
      expect(() => validateManifest(manifest("invalid-extension", [extension]))).toThrow(ViewerError);
    },
  );

  it("rejects duplicate registrations", () => {
    expect(() => validateRegistrations([
      registration("duplicate", [".pdf"]),
      registration("duplicate", [".xlsx"]),
    ])).toThrow(/重复注册/);
  });

  it("matches compound extensions, wildcard viewers, and preserves registration order", () => {
    const registrations = [
      registration("archive", [".tar.gz"]),
      registration("fallback", ["*"]),
      registration("gzip", [".gz"]),
    ];

    expect(findViewerRegistrations("BACKUP.TAR.GZ", registrations).map(({ manifest: item }) => item.id))
      .toEqual(["archive", "fallback", "gzip"]);
  });

  it("rejects a loaded plugin whose identity differs from its registration", () => {
    const registered = registration("registered", [".pdf"]);
    const loaded: FileViewerPlugin = {
      manifest: manifest("different", [".pdf"]),
      async open() { return { dispose() {} }; },
    };

    expect(() => validateLoadedPlugin(registered, loaded)).toThrow(/不一致/);
  });

  it("preserves protocol errors and sanitizes unknown errors", () => {
    const known = new ViewerError("invalid-file", "文件无效");
    expect(normalizeViewerError(known)).toBe(known);

    const normalized = normalizeViewerError(new Error("internal path leaked"));
    expect(normalized).toMatchObject({ code: "open-failed", message: "无法打开这个文件。" });
    expect(normalized.cause).toBeInstanceOf(Error);
  });
});
