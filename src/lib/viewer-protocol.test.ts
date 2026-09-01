import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => vi.unstubAllGlobals());

function manifest(
  id: string,
  extensions: readonly string[],
  fileNames?: readonly string[],
): ViewerPluginManifest {
  return {
    protocolVersion: VIEWER_PROTOCOL_VERSION,
    id,
    name: { en: id, "zh-CN": id },
    formats: [{ name: { en: id, "zh-CN": id }, extensions, fileNames }],
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
    ])).toThrow(/registered more than once/);
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
      .toEqual(["insta360", "browser-video", "non-native-video", "browser-audio", "non-native-audio", "browser-image", "modern-raster", "camera-raw", "general-raster", "safe-svg", "pdfjs-pdf", "word-document", "excel-workbook", "powerpoint-presentation", "sqlite-database", "dev-array-viewer", "dev-wasm-viewer", "dev-source-map-viewer", "duckdb-data", "archive-metadata-viewer"]);

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

    const videoBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/browser-video/examples/mp4-avc-aac-faststart.mp4",
    ));
    const video = await resolveViewerRegistrations(
      new File([videoBytes], "clip.mp4"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(video.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["browser-video", 3], ["hex-viewer", 1]]);

    vi.stubGlobal("VideoDecoder", class VideoDecoder {});
    vi.stubGlobal("AudioDecoder", class AudioDecoder {});
    vi.stubGlobal("AudioContext", class AudioContext {});
    const matroskaBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/non-native-video/examples/mkv-vp9-opus.mkv",
    ));
    const matroska = await resolveViewerRegistrations(
      new File([matroskaBytes], "clip.mkv"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(matroska.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["non-native-video", 3], ["hex-viewer", 1]]);

    const mp3Bytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/browser-audio/examples/mp3-cbr.mp3",
    ));
    const audio = await resolveViewerRegistrations(
      new File([mp3Bytes], "tone.mp3"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(audio.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["browser-audio", 3], ["hex-viewer", 1]]);

    const mkaBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/non-native-audio/examples/mka-opus.mka",
    ));
    const mka = await resolveViewerRegistrations(
      new File([mkaBytes], "tone.mka"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(mka.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["non-native-audio", 3], ["hex-viewer", 1]]);

    const transportStreamBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/non-native-video/examples/ts-avc-aac.ts.fixture",
    ));
    const transportStream = await resolveViewerRegistrations(
      new File([transportStreamBytes], "clip.ts"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(transportStream.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["non-native-video", 3], ["ace-code-text", 1], ["hex-viewer", 1]]);

    const npyBytes = readFileSync(join(process.cwd(), "viewer/plugins/dev-array/examples/matrix.npy"));
    const npy = await resolveViewerRegistrations(
      new File([npyBytes], "matrix.npy"), viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(npy.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["dev-array-viewer", 3], ["hex-viewer", 1]]);

    const wasm = await resolveViewerRegistrations(
      new File([Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0)], "module.wasm"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(wasm.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["dev-wasm-viewer", 2], ["hex-viewer", 1]]);

    const sourceMap = await resolveViewerRegistrations(
      new File(['{"version":3,"sources":[],"names":[],"mappings":""}'], "bundle.js.map"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(sourceMap.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["dev-source-map-viewer", 3], ["hex-viewer", 1]]);

    const duckdb = await resolveViewerRegistrations(
      new File([], "database.duckdb"), viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(duckdb.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["duckdb-data", 3], ["hex-viewer", 1]]);

    const tgzBytes = readFileSync(join(process.cwd(), "viewer/plugins/archive/examples/package.tgz"));
    const tgz = await resolveViewerRegistrations(
      new File([tgzBytes], "package.tgz"), viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(tgz.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
      .toEqual([["archive-metadata-viewer", 2], ["hex-viewer", 1]]);

    const officeBytes = readFileSync(join(process.cwd(), "viewer/plugins/archive/examples/archive.zip"));
    for (const [name, expected] of [
      ["document.docx", "word-document"],
      ["workbook.xlsx", "excel-workbook"],
      ["workbook.ods", "excel-workbook"],
      ["slides.pptx", "powerpoint-presentation"],
    ] as const) {
      const resolved = await resolveViewerRegistrations(
        new File([officeBytes], name), viewerRegistrations,
        { signal: new AbortController().signal },
      );
      expect(resolved.map(({ registration: item, supportLevel }) => [item.manifest.id, supportLevel]))
        .toEqual([[expected, 4], ["archive-metadata-viewer", 2], ["hex-viewer", 1]]);
    }
  });

  it("rejects a loaded plugin whose identity differs from its registration", () => {
    const registered = registration("registered", [".pdf"]);
    const loaded: FileViewerPlugin = {
      manifest: manifest("different", [".pdf"]),
      async open() { return { dispose() {} }; },
    };

    expect(() => validateLoadedPlugin(registered, loaded)).toThrow(/does not match/);
  });

  it("preserves protocol errors and sanitizes unknown errors", () => {
    const known = new ViewerError("invalid-file", "文件无效");
    expect(normalizeViewerError(known)).toBe(known);

    const normalized = normalizeViewerError(new Error("internal path leaked"));
    expect(normalized).toMatchObject({ code: "open-failed", message: "Unable to open this file." });
    expect(normalized.cause).toBeInstanceOf(Error);
  });

  it("keeps specialized viewers ahead of archive metadata and hex fallback", () => {
    expect(findViewerRegistrations("photo.insp", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["insta360", "hex-viewer"]);
    expect(findViewerRegistrations("proxy.lrv", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["insta360", "hex-viewer"]);
    expect(findViewerRegistrations("clip.mp4", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["browser-video", "browser-audio", "hex-viewer"]);
    expect(findViewerRegistrations("clip.webm", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["browser-video", "browser-audio", "hex-viewer"]);
    expect(findViewerRegistrations("clip.mov", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["browser-video", "non-native-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.3gp", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["browser-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.mkv", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["non-native-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.ts", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["non-native-video", "ace-code-text", "hex-viewer"]);
    expect(findViewerRegistrations("clip.m2ts", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["non-native-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.ogv", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["non-native-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.ogg", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["non-native-video", "browser-audio", "hex-viewer"]);
    expect(findViewerRegistrations("tone.mp3", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["browser-audio", "hex-viewer"]);
    expect(findViewerRegistrations("tone.mka", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["non-native-audio", "hex-viewer"]);
    expect(findViewerRegistrations("photo.avif", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["browser-image", "hex-viewer"]);
    expect(findViewerRegistrations("photo.jxl", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["modern-raster", "hex-viewer"]);
    expect(findViewerRegistrations("photo.heic", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["modern-raster", "hex-viewer"]);
    expect(findViewerRegistrations("photo.heif", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["browser-image", "modern-raster", "hex-viewer"]);
    expect(findViewerRegistrations("photo.dng", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["insta360", "camera-raw", "hex-viewer"]);
    expect(findViewerRegistrations("photo.rw2", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["camera-raw", "hex-viewer"]);
    for (const extension of ["nrw", "sr2", "srf", "orf", "pef"]) {
      expect(findViewerRegistrations(`photo.${extension}`, viewerRegistrations).map(({ manifest: item }) => item.id))
        .toEqual(["camera-raw", "hex-viewer"]);
    }
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
    expect(findViewerRegistrations("vector.svg", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["safe-svg", "ace-code-text", "hex-viewer"]);
    expect(findViewerRegistrations("vector.svgz", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["safe-svg", "hex-viewer"]);
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
    expect(findViewerRegistrations("module.wasm", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["dev-wasm-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("bundle.js.map", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["dev-source-map-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("database.duckdb", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["duckdb-data", "hex-viewer"]);
    expect(findViewerRegistrations("backup.tar.gz", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("backup.rar", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("unknown.binary", viewerRegistrations).map(({ manifest: item }) => item.id))
      .toEqual(["hex-viewer"]);
  });
});
