import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export interface VendorAssetSpec {
  readonly pkg: string;
  readonly version: string;
  readonly file: string;
  readonly sha256?: string;
}

const SEGMENT_PATTERN = /^[a-zA-Z0-9._-]+$/;

function assertSafeSegment(value: string, label: string): void {
  if (!value || value === "." || value === ".." || !SEGMENT_PATTERN.test(value)) {
    throw new Error(`Invalid vendor asset ${label}: "${value}"`);
  }
}

function assertSafeRelativeFile(file: string): string {
  const normalized = normalize(file).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.startsWith("../") || normalized === ".." || normalized.includes("/../")) {
    throw new Error(`Invalid vendor asset file path: "${file}"`);
  }
  return normalized;
}

/**
 * Returns the local vendor cache root: `$ANYFILE_CACHE_DIR/vendor` or `~/.cache/anyfile/vendor`.
 */
export function getVendorCacheRoot(cacheDir = process.env.ANYFILE_CACHE_DIR): string {
  const base = cacheDir?.trim()
    ? resolve(cacheDir)
    : join(homedir(), ".cache", "anyfile");
  return join(base, "vendor");
}

/**
 * Resolves a local cached `/vendor/<pkg>/<version>/<file>` path safely within the cache root.
 */
export function resolveVendorAssetPath(
  spec: VendorAssetSpec,
  options?: { readonly cacheDir?: string },
): string {
  assertSafeSegment(spec.pkg, "package");
  assertSafeSegment(spec.version, "version");
  const safeFile = assertSafeRelativeFile(spec.file);
  const root = getVendorCacheRoot(options?.cacheDir);
  const fullPath = resolve(root, spec.pkg, spec.version, safeFile);
  if (fullPath !== root && !fullPath.startsWith(`${root}${sep}`)) {
    throw new Error(`Vendor asset path escaped cache root: "${spec.file}"`);
  }
  return fullPath;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Reads a cached vendor asset from disk without network access and optionally verifies SHA-256.
 */
export async function readLocalVendorAsset(
  spec: VendorAssetSpec,
  options?: { readonly cacheDir?: string },
): Promise<Uint8Array> {
  const filePath = resolveVendorAssetPath(spec, options);
  const bytes = new Uint8Array(await readFile(filePath));
  if (spec.sha256) {
    const actual = sha256Hex(bytes);
    if (actual !== spec.sha256.toLowerCase()) {
      throw new Error(
        `SHA-256 mismatch for vendor asset ${spec.pkg}/${spec.version}/${spec.file}: expected ${spec.sha256}, got ${actual}`,
      );
    }
  }
  return bytes;
}

/**
 * Returns a `file://` URL for a verified local vendor asset so Node workers can `importRuntime()` it.
 */
export async function resolveVerifiedVendorAssetUrl(
  spec: VendorAssetSpec,
  options?: { readonly cacheDir?: string },
): Promise<string> {
  await readLocalVendorAsset(spec, options);
  return pathToFileURL(resolveVendorAssetPath(spec, options)).href;
}
