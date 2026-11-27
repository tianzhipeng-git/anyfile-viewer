import { existsSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { getVendorCacheRoot } from "@anyfile/runtime-assets/node";
import { AgentError } from "@anyfile/viewer-protocol";
import { viewerRegistryEntries } from "@anyfile/viewer-registry";
import { pluginVendorPatterns } from "./generated/vendor-plugins";
import { VendorAssetStore } from "./vendor-store";

export interface CachedAssetEntry {
  readonly path: string;
  readonly bytes: number;
}

export interface AddVendorCacheOptions {
  readonly cacheDir?: string;
  readonly vendorUpstreamBaseUrl?: string;
  readonly vendorManifest?: Readonly<Record<string, string>>;
  readonly concurrency?: number;
}

export interface AddVendorCacheResult {
  readonly root: string;
  readonly targets: readonly string[];
  readonly downloaded: readonly CachedAssetEntry[];
  readonly alreadyCached: readonly CachedAssetEntry[];
  readonly totalBytes: number;
}

const RUNTIME_ASSET_PATTERN = /\.(wasm|js|mjs|bcmap|pfb|ttf|otf|woff2|icc|dat|data|mem)$/i;
const BUILD_HELPER_PATTERN = /(^|\/)(fetch|write-build-info)\.mjs$/i;

/** Filters out GPL source archives, build scripts, and license metadata from `/vendor/` prefetch sets. */
export function isRuntimeVendorAsset(assetPath: string): boolean {
  return RUNTIME_ASSET_PATTERN.test(assetPath) && !BUILD_HELPER_PATTERN.test(assetPath);
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\0DOUBLE\0")
    .replaceAll("*", "[^/]*")
    .replaceAll("\0DOUBLE\0", ".*");
  return new RegExp(`^${escaped}$`);
}

function knownPluginIds(): Set<string> {
  const ids = new Set<string>(Object.keys(pluginVendorPatterns));
  for (const entry of viewerRegistryEntries) {
    ids.add(entry.manifest.id);
  }
  return ids;
}

export function resolveVendorAssetsForPlugins(
  targets: readonly string[],
  manifest: Readonly<Record<string, string>>,
): string[] {
  const cleaned = targets.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new AgentError("invalid-argument", "Usage: anyfile cache add <pluginIds...|all>");
  }

  const allRuntimeAssets = Object.keys(manifest).filter(isRuntimeVendorAsset);
  if (cleaned.includes("all")) {
    return allRuntimeAssets.sort((a, b) => a.localeCompare(b));
  }

  const known = knownPluginIds();
  const matched = new Set<string>();
  for (const pluginId of cleaned) {
    if (!known.has(pluginId)) {
      throw new AgentError(
        "invalid-argument",
        `Unknown plugin id: "${pluginId}". Pass "all" or a valid plugin id from "anyfile inspect".`,
      );
    }
    const patterns = pluginVendorPatterns[pluginId] ?? [];
    if (patterns.length === 0) continue;
    const regexes = patterns.map(globToRegex);
    for (const assetPath of allRuntimeAssets) {
      if (regexes.some((re) => re.test(assetPath))) {
        matched.add(assetPath);
      }
    }
  }

  return [...matched].sort((a, b) => a.localeCompare(b));
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (nextIndex < items.length) {
        const idx = nextIndex++;
        results[idx] = await worker(items[idx]);
      }
    }),
  );
  return results;
}

async function walkFiles(dir: string, root: string, out: CachedAssetEntry[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, root, out);
    } else if (entry.isFile()) {
      const info = await stat(full);
      out.push({ path: relative(root, full).replaceAll("\\", "/"), bytes: info.size });
    }
  }
}

export async function listVendorCache(cacheDir?: string): Promise<{
  readonly root: string;
  readonly entries: readonly CachedAssetEntry[];
  readonly totalBytes: number;
}> {
  const root = getVendorCacheRoot(cacheDir);
  if (!existsSync(root)) {
    return { root, entries: [], totalBytes: 0 };
  }
  const entries: CachedAssetEntry[] = [];
  await walkFiles(root, root, entries);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const totalBytes = entries.reduce((sum, item) => sum + item.bytes, 0);
  return { root, entries, totalBytes };
}

export async function addVendorCache(
  targets: readonly string[],
  options: AddVendorCacheOptions = {},
): Promise<AddVendorCacheResult> {
  const root = getVendorCacheRoot(options.cacheDir);
  const store = new VendorAssetStore({
    vendorCacheRoot: root,
    vendorRoots: [root],
    vendorManifest: options.vendorManifest,
    vendorUpstreamBaseUrl: options.vendorUpstreamBaseUrl,
  });

  const assetPaths = resolveVendorAssetsForPlugins(targets, store.vendorManifest);
  const ensured = await runWithConcurrency(assetPaths, options.concurrency ?? 4, (assetPath) =>
    store.ensureCached(assetPath, { cacheOnly: true }),
  );

  const downloaded: CachedAssetEntry[] = [];
  const alreadyCached: CachedAssetEntry[] = [];
  for (const item of ensured) {
    const entry: CachedAssetEntry = { path: item.path, bytes: item.bytes };
    if (item.downloaded) {
      downloaded.push(entry);
    } else {
      alreadyCached.push(entry);
    }
  }
  const totalBytes = ensured.reduce((sum, item) => sum + item.bytes, 0);

  return {
    root,
    targets: targets.map((t) => t.trim()).filter(Boolean),
    downloaded,
    alreadyCached,
    totalBytes,
  };
}

export async function clearVendorCache(cacheDir?: string): Promise<{ readonly root: string; readonly cleared: boolean }> {
  const root = getVendorCacheRoot(cacheDir);
  if (!existsSync(root)) {
    return { root, cleared: false };
  }
  await rm(root, { recursive: true, force: true });
  return { root, cleared: true };
}
