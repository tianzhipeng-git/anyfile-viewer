import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertVendorPath, defaultVendorRoots, getVendorCacheRoot, sha256Hex } from "@anyfile/runtime-assets/node";
import { AgentError } from "@anyfile/viewer-protocol";
import { loadDefaultVendorManifest } from "./vendor-manifest";

export const DEFAULT_VENDOR_UPSTREAM_URL = "https://assets.anyfile.top/vendor";

export interface VendorAssetStoreOptions {
  readonly vendorRoots?: readonly string[];
  readonly vendorCacheRoot?: string;
  readonly vendorManifest?: Readonly<Record<string, string>>;
  readonly vendorUpstreamBaseUrl?: string;
}

export interface EnsureVendorResult {
  readonly path: string;
  readonly bytes: number;
  readonly downloaded: boolean;
}

/**
 * Host-side `/vendor/<pkg>/<version>/*` resolver, SHA-256 verifier, and atomic on-demand cache.
 * Shared by `RenderAssetServer` (Chromium), `ExtractWorkerPool` (Node workers), and `anyfile cache add`.
 */
export class VendorAssetStore {
  readonly vendorRoots: readonly string[];
  readonly vendorCacheRoot: string;
  readonly vendorManifest: Readonly<Record<string, string>>;
  readonly vendorUpstreamBaseUrl: string;
  private readonly inflightDownloads = new Map<string, Promise<Uint8Array>>();

  constructor(options: VendorAssetStoreOptions = {}) {
    this.vendorCacheRoot = options.vendorCacheRoot ?? getVendorCacheRoot();
    this.vendorRoots = options.vendorRoots ?? (options.vendorCacheRoot ? [this.vendorCacheRoot] : defaultVendorRoots());
    this.vendorManifest = options.vendorManifest ?? loadDefaultVendorManifest();
    const rawUpstream = options.vendorUpstreamBaseUrl ?? process.env.ANYFILE_VENDOR_UPSTREAM_URL ?? DEFAULT_VENDOR_UPSTREAM_URL;
    this.vendorUpstreamBaseUrl = rawUpstream.replace(/\/+$/, "");
  }

  expectedSha(vendorPath: string): string | undefined {
    return this.vendorManifest[vendorPath]?.toLowerCase();
  }

  locateLocal(vendorPath: string, roots: readonly string[] = this.vendorRoots): string | null {
    const segments = assertVendorPath(vendorPath);
    for (const root of roots) {
      const candidate = join(root, ...segments);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Not present under this root.
      }
    }
    return null;
  }

  async readVerifiedFile(filePath: string, vendorPath: string): Promise<Uint8Array> {
    const bytes = new Uint8Array(await readFile(filePath));
    const expectedSha = this.expectedSha(vendorPath);
    if (expectedSha && sha256Hex(bytes) !== expectedSha) {
      throw new AgentError("runtime-unavailable", `SHA-256 mismatch for /vendor/${vendorPath}`);
    }
    return bytes;
  }

  /**
   * Resolves a `/vendor/` asset from local roots (verifying SHA-256), or downloads & caches it
   * from upstream when listed in the manifest. Returns `null` if missing locally and unlisted/offline.
   */
  async readOrFetch(vendorPath: string): Promise<Uint8Array | null> {
    const segments = assertVendorPath(vendorPath);
    const localFile = this.locateLocal(vendorPath);
    if (localFile) {
      return this.readVerifiedFile(localFile, vendorPath);
    }

    const expectedSha = this.expectedSha(vendorPath);
    if (!expectedSha || !this.vendorUpstreamBaseUrl) {
      return null;
    }

    return this.fetchAndCache(vendorPath, segments, expectedSha);
  }

  /**
   * Ensures a `/vendor/` asset is available locally (either in `vendorRoots` or downloaded into `vendorCacheRoot`).
   * When `cacheOnly` is true (used by `cache add`), verifies presence specifically in `vendorCacheRoot`.
   */
  async ensureCached(vendorPath: string, options: { readonly cacheOnly?: boolean } = {}): Promise<EnsureVendorResult> {
    const segments = assertVendorPath(vendorPath);
    const expectedSha = this.expectedSha(vendorPath);
    const searchRoots = options.cacheOnly ? [this.vendorCacheRoot] : this.vendorRoots;
    const localFile = this.locateLocal(vendorPath, searchRoots);

    if (localFile) {
      const bytes = await readFile(localFile);
      const actualSha = sha256Hex(bytes);
      if (!expectedSha || actualSha === expectedSha) {
        return { path: vendorPath, bytes: bytes.byteLength, downloaded: false };
      }
      if (!options.cacheOnly) {
        throw new AgentError("runtime-unavailable", `SHA-256 mismatch for /vendor/${vendorPath}`);
      }
      // In cacheOnly (`cache add`) mode, fall through and overwrite a corrupted cache entry with a verified copy.
    }

    if (!expectedSha) {
      throw new AgentError("runtime-unavailable", `Runtime asset /vendor/${vendorPath} is not in the verified manifest.`);
    }
    if (!this.vendorUpstreamBaseUrl) {
      throw new AgentError("runtime-unavailable", `Runtime asset /vendor/${vendorPath} is unavailable offline.`);
    }

    const bytes = await this.fetchAndCache(vendorPath, segments, expectedSha);
    return { path: vendorPath, bytes: bytes.byteLength, downloaded: true };
  }

  private fetchAndCache(
    vendorPath: string,
    segments: readonly string[],
    expectedSha: string,
  ): Promise<Uint8Array> {
    const existing = this.inflightDownloads.get(vendorPath);
    if (existing) return existing;

    const promise = (async () => {
      const upstreamUrl = `${this.vendorUpstreamBaseUrl}/${vendorPath}`;
      let response: Response;
      try {
        response = await fetch(upstreamUrl);
      } catch (error) {
        throw new AgentError(
          "runtime-unavailable",
          `Failed to fetch /vendor/${vendorPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!response.ok) {
        throw new AgentError(
          "runtime-unavailable",
          `Upstream vendor fetch failed (${response.status}) for ${vendorPath}`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (sha256Hex(bytes) !== expectedSha) {
        throw new AgentError(
          "runtime-unavailable",
          `SHA-256 verification failed for downloaded /vendor/${vendorPath}`,
        );
      }
      const dest = join(this.vendorCacheRoot, ...segments);
      await mkdir(dirname(dest), { recursive: true });
      const tmp = `${dest}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(tmp, bytes);
      await rename(tmp, dest);
      return bytes;
    })().finally(() => {
      this.inflightDownloads.delete(vendorPath);
    });

    this.inflightDownloads.set(vendorPath, promise);
    return promise;
  }
}
