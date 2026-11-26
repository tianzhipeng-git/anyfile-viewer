import { describe, expect, it } from "vitest";
import {
  VIEWER_PROTOCOL_VERSION,
  ViewerError,
  abortError,
  findViewerRegistrations,
  isViewerAbortError,
  normalizeViewerError,
  readBlob,
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

  it("falls back to byte probes for files whose name matches only catch-alls", async () => {
    const sniffs: ViewerPluginRegistration = {
      ...registration("sniffs", [".db"]),
      async probe({ file }) { return new Uint8Array(await file.slice(0, 2).arrayBuffer())[0] === 0x53 ? 3 : 0; },
    };
    const guesses: ViewerPluginRegistration = { ...registration("guesses", [".x"]), async probe() { return 4; } };
    const resolve = (name: string, magicFallback?: boolean) => resolveViewerRegistrations(
      new File(["SQ"], name),
      [sniffs, guesses, registration("catch-all", ["*"])],
      { signal: new AbortController().signal, magicFallback },
    );

    expect((await resolve("blob")).map(({ registration: { manifest } }) => manifest.id)).toEqual(["catch-all"]);
    expect((await resolve("blob", true)).map(({ registration: { manifest }, matchedBy }) => [manifest.id, matchedBy]))
      .toEqual([["sniffs", "magic"], ["catch-all", undefined]]);
    expect((await resolve("data.db", true)).map(({ matchedBy }) => matchedBy)).toEqual([undefined, undefined]);
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

  it("abortError is a standard AbortError and recognized as cancellation", () => {
    const error = abortError();
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe("AbortError");
    expect(isViewerAbortError(error)).toBe(true);
  });

  it("readBlob concatenates the blob and rejects on an already-aborted signal", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]);
    expect([...await readBlob(blob, new AbortController().signal)]).toEqual([1, 2, 3, 4, 5]);

    await expect(readBlob(blob, AbortSignal.abort())).rejects.toSatisfy(isViewerAbortError);
  });
});
