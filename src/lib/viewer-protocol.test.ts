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
import { viewerRegistrations } from "./viewer-registrations";

function manifest(
  id: string,
  extensions: readonly string[],
  fileNames?: readonly string[],
): ViewerPluginManifest {
  return {
    protocolVersion: VIEWER_PROTOCOL_VERSION,
    id,
    name: id,
    formats: [{ name: id, extensions, fileNames }],
    workspaceAccess: "none",
  };
}

function registration(
  id: string,
  extensions: readonly string[],
  fileNames?: readonly string[],
): ViewerPluginRegistration {
  const pluginManifest = manifest(id, extensions, fileNames);
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
      registration("archive", [".tar.gz", ".gz"]),
      registration("fallback", ["*"]),
      registration("gzip", [".gz"]),
    ];

    expect(findViewerRegistrations("BACKUP.TAR.GZ", registrations).map(({ manifest: item }) => item.id))
      .toEqual(["archive", "fallback", "gzip"]);
  });

  it("matches exact file names through the registration index", () => {
    const registrations = [
      registration("code", [], ["Dockerfile"]),
      registration("fallback", ["*"]),
    ];

    expect(findViewerRegistrations("DOCKERFILE", registrations).map(({ manifest: item }) => item.id))
      .toEqual(["code", "fallback"]);
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

  it("keeps specialized viewers ahead of archive metadata and hex fallback", () => {
    expect(findViewerRegistrations("report.docx", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["word-document", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("slides.pptx", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["powerpoint-presentation", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("book.xlsx", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["excel-workbook", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("rows.csv.gz", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["duckdb-data", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("backup.tar.gz", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("backup.rar", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("unknown.binary", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["hex-viewer"]);
  });
});
