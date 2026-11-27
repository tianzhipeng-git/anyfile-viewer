import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { VendorAssets } from "@anyfile/viewer-protocol";

const SEGMENT_PATTERN = /^[a-zA-Z0-9._-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface VendorManifestEntry {
  readonly sha256: string;
  readonly bytes: number;
}

export interface VendorManifest {
  readonly schemaVersion: 1;
  readonly assets: Readonly<Record<string, VendorManifestEntry>>;
}

export function parseVendorManifest(raw: unknown): VendorManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Vendor manifest must be a JSON object.");
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error(`Unsupported vendor manifest schemaVersion: ${String(record.schemaVersion)}`);
  }
  if (!record.assets || typeof record.assets !== "object" || Array.isArray(record.assets)) {
    throw new Error("Vendor manifest is missing assets map.");
  }
  const assets: Record<string, VendorManifestEntry> = {};
  for (const [assetPath, entry] of Object.entries(record.assets as Record<string, unknown>)) {
    assertVendorPath(assetPath);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid vendor manifest entry for "${assetPath}".`);
    }
    const { sha256, bytes } = entry as Record<string, unknown>;
    if (typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256.toLowerCase())) {
      throw new Error(`Invalid sha256 hash in vendor manifest for "${assetPath}".`);
    }
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 0) {
      throw new Error(`Invalid byte length in vendor manifest for "${assetPath}".`);
    }
    assets[assetPath] = { sha256: sha256.toLowerCase(), bytes };
  }
  return { schemaVersion: 1, assets };
}

export function toVendorHashMap(
  manifest: VendorManifest | Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  if ("schemaVersion" in manifest && manifest.schemaVersion === 1 && "assets" in manifest && typeof manifest.assets === "object") {
    const hashes: Record<string, string> = {};
    for (const [assetPath, entry] of Object.entries((manifest as VendorManifest).assets)) {
      hashes[assetPath] = entry.sha256;
    }
    return hashes;
  }
  return manifest as Readonly<Record<string, string>>;
}

export async function loadVendorManifest(
  manifestPath = join(fileURLToPath(new URL("../../../", import.meta.url)), "public/vendor/manifest.json"),
): Promise<VendorManifest | undefined> {
  let rawText: string;
  try {
    rawText = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return parseVendorManifest(JSON.parse(rawText));
}

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
  manifest: VendorManifest | Readonly<Record<string, string>> = {},
): VendorAssets {
  const hashMap = toVendorHashMap(manifest);
  const locate = (path: string) => {
    const segments = assertVendorPath(path);
    for (const root of roots) {
      const candidate = join(root, ...segments);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Not present under this root.
      }
    }
    throw Object.assign(new Error(`Runtime asset /vendor/${path} is not available locally.`), { code: "runtime-unavailable" });
  };
  const readVerified = async (path: string) => {
    const filePath = locate(path);
    const bytes = new Uint8Array(await readFile(filePath));
    const expected = hashMap[path];
    if (expected && sha256Hex(bytes) !== expected.toLowerCase()) {
      throw Object.assign(new Error(`SHA-256 mismatch for /vendor/${path}.`), { code: "runtime-unavailable" });
    }
    return { filePath, bytes };
  };
  return {
    async bytes(path) {
      return (await readVerified(path)).bytes;
    },
    async url(path) {
      return pathToFileURL((await readVerified(path)).filePath).href;
    },
  };
}
