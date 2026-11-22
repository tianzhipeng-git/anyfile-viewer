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
});
