import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { VendorAssets } from "@anyfile/viewer-protocol";

const SEGMENT_PATTERN = /^[a-zA-Z0-9._-]+$/;

/** Local vendor cache root: `$ANYFILE_CACHE_DIR/vendor` or `~/.cache/anyfile/vendor`. */
export function getVendorCacheRoot(cacheDir = process.env.ANYFILE_CACHE_DIR): string {
  return join(cacheDir?.trim() ? resolve(cacheDir) : join(homedir(), ".cache", "anyfile"), "vendor");
}

/**
 * Vendor roots searched in order: the local cache, then — inside this monorepo only — the
 * prepared `public/vendor/` and the audited `third_party/` builds, which share the
 * `<pkg>/<version>/<file>` layout.
 */
export function defaultVendorRoots(): string[] {
  const repo = fileURLToPath(new URL("../../../", import.meta.url));
  return [getVendorCacheRoot(), join(repo, "public/vendor"), join(repo, "third_party")];
}

/** Validates a `<pkg>/<version>/<file…>` vendor path; rejects traversal and odd characters. */
export function assertVendorPath(path: string): string[] {
  const segments = path.split("/");
  if (segments.length < 3 || segments.some((segment) => segment === "." || segment === ".." || !SEGMENT_PATTERN.test(segment))) {
    throw new Error(`Invalid vendor asset path: "${path}"`);
  }
  return segments;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Node `VendorAssets`: resolves `/vendor/` paths against local roots, never the network.
 * Assets listed in `manifest` (path → SHA-256) are verified before use.
 */
export function createNodeVendorAssets(
  roots: readonly string[] = defaultVendorRoots(),
  manifest: Readonly<Record<string, string>> = {},
): VendorAssets {
  const locate = (path: string) => {
    const segments = assertVendorPath(path);
    for (const root of roots) {
      const candidate = join(root, ...segments);
      if (existsSync(candidate)) return candidate;
    }
    throw Object.assign(new Error(`Runtime asset /vendor/${path} is not available locally.`), { code: "runtime-unavailable" });
  };
  const read = async (path: string) => {
    const bytes = new Uint8Array(await readFile(locate(path)));
    const expected = manifest[path];
    if (expected && sha256Hex(bytes) !== expected.toLowerCase()) {
      throw Object.assign(new Error(`SHA-256 mismatch for /vendor/${path}.`), { code: "runtime-unavailable" });
    }
    return bytes;
  };
  return {
    bytes: read,
    async url(path) {
      await read(path);
      return pathToFileURL(locate(path)).href;
    },
  };
}
