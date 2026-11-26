import { existsSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { getVendorCacheRoot } from "@anyfile/runtime-assets/node";

export interface CachedAssetEntry {
  readonly path: string;
  readonly bytes: number;
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

export async function clearVendorCache(cacheDir?: string): Promise<{ readonly root: string; readonly cleared: boolean }> {
  const root = getVendorCacheRoot(cacheDir);
  if (!existsSync(root)) {
    return { root, cleared: false };
  }
  await rm(root, { recursive: true, force: true });
  return { root, cleared: true };
}
