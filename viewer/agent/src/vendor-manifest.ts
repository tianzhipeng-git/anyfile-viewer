import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface VendorManifestEntry {
  readonly sha256: string;
  readonly bytes: number;
}

export interface VendorManifestDocument {
  readonly schemaVersion: 1;
  readonly assets: Readonly<Record<string, VendorManifestEntry>>;
}

/** Parses either `{ schemaVersion: 1, assets: { [path]: { sha256, bytes } } }` or flat `{ [path]: sha256 }`. */
export function parseVendorManifestMap(raw: unknown): Readonly<Record<string, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const map: Record<string, string> = {};
  if (obj.schemaVersion === 1 && obj.assets && typeof obj.assets === "object" && !Array.isArray(obj.assets)) {
    for (const [assetPath, entry] of Object.entries(obj.assets as Record<string, unknown>)) {
      if (entry && typeof entry === "object" && typeof (entry as { sha256?: unknown }).sha256 === "string") {
        map[assetPath] = ((entry as { sha256: string }).sha256).toLowerCase();
      }
    }
    return map;
  }
  for (const [assetPath, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      map[assetPath] = value.toLowerCase();
    }
  }
  return map;
}

/** Locates and loads the vendor SHA-256 manifest from packaged `dist/` or monorepo `public/vendor/manifest.json`. */
export function loadDefaultVendorManifest(): Readonly<Record<string, string>> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "vendor-manifest.json"),
    resolve(here, "../vendor-manifest.json"),
    resolve(here, "../dist/vendor-manifest.json"),
    resolve(here, "../../../public/vendor/manifest.json"),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return parseVendorManifestMap(JSON.parse(readFileSync(candidate, "utf8")));
    } catch {
      // Fall through to next candidate.
    }
  }
  return {};
}
