import { describe, expect, it } from "vitest";
import {
  VIEWER_PROTOCOL_VERSION,
  ViewerError,
  findViewerRegistrations,
  normalizeViewerError,
  resolveViewerRegistrations,
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

  it("probes candidates concurrently and sorts by support level then registration order", async () => {
    const first: ViewerPluginRegistration = {
      ...registration("first", [".sample"]),
      async probe() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 4;
      },
    };
    const second: ViewerPluginRegistration = {
      ...registration("second", [".sample"]),
      async probe() { return 4; },
    };
    const fallback = registration("fallback", ["*"]);
    const broken: ViewerPluginRegistration = {
      ...registration("broken", [".sample"]),
      async probe() { throw new Error("probe failed"); },
    };
    const unsupported: ViewerPluginRegistration = {
      ...registration("unsupported", [".sample"]),
      async probe() { return 0; },
    };

    const resolved = await resolveViewerRegistrations(
      new File(["header"], "file.sample"),
      [first, fallback, second, broken, unsupported],
      { signal: new AbortController().signal },
    );

    expect(resolved.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["first", 4], ["second", 4], ["fallback", 1]]);
  });

  it("filters workspace-required candidates before probing and rejects invalid probe results", async () => {
    let requiredProbeCalled = false;
    const requiredRegistration = registration("required", [".sample"]);
    const required: ViewerPluginRegistration = {
      ...requiredRegistration,
      manifest: { ...requiredRegistration.manifest, workspaceAccess: "required" },
      async probe() {
        requiredProbeCalled = true;
        return 5;
      },
    };
    const invalid: ViewerPluginRegistration = {
      ...registration("invalid", [".sample"]),
      async probe() { return 6 as never; },
    };

    const resolved = await resolveViewerRegistrations(
      new File([], "file.sample"),
      [required, invalid],
      { signal: new AbortController().signal },
    );

    expect(requiredProbeCalled).toBe(false);
    expect(resolved).toEqual([]);
  });

  it("propagates probe cancellation", async () => {
    const controller = new AbortController();
    const cancellable: ViewerPluginRegistration = {
      ...registration("cancellable", [".sample"]),
      probe: ({ signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      }),
    };

    const resolution = resolveViewerRegistrations(
      new File([], "file.sample"),
      [cancellable],
      { signal: controller.signal },
    );
    controller.abort();

    await expect(resolution).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses specialized probes in the production registry", async () => {
    expect(viewerRegistrations.filter(({ probe }) => probe).map(({ manifest: item }) => item.id))
      .toEqual(["browser-image", "modern-raster", "camera-raw", "general-raster", "pdfjs-pdf", "sqlite-database"]);

    const invalidPdf = await resolveViewerRegistrations(
      new File(["not a pdf"], "document.pdf"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(invalidPdf.map(({ registration: item }) => item.manifest.id)).toEqual(["hex-viewer"]);

    const sqlite = await resolveViewerRegistrations(
      new File(["SQLite format 3\0payload"], "database.db"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(sqlite.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["sqlite-database", 5], ["hex-viewer", 1]]);
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
    expect(findViewerRegistrations("photo.avif", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["browser-image", "hex-viewer"]);
    expect(findViewerRegistrations("photo.jxl", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["modern-raster", "hex-viewer"]);
    expect(findViewerRegistrations("photo.heic", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["modern-raster", "hex-viewer"]);
    expect(findViewerRegistrations("photo.heif", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["browser-image", "modern-raster", "hex-viewer"]);
    expect(findViewerRegistrations("photo.dng", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["camera-raw", "hex-viewer"]);
    expect(findViewerRegistrations("photo.rw2", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["camera-raw", "hex-viewer"]);
    expect(findViewerRegistrations("scan.tiff", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("scan.tf8", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("slide.ome.tiff", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("map.geotiff", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("texture.vst", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("report.docx", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["word-document", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("slides.pptx", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["powerpoint-presentation", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("book.xlsx", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["excel-workbook", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("rows.csv.gz", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["duckdb-data", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("network.har", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["http-archive", "hex-viewer"]);
    expect(findViewerRegistrations("backup.tar.gz", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("backup.rar", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("unknown.binary", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["hex-viewer"]);
  });
});
