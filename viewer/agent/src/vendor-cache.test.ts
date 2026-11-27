// @vitest-environment node
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentService } from "./agent-core";
import { addVendorCache, isRuntimeVendorAsset, listVendorCache, resolveVendorAssetsForPlugins } from "./cache";
import { loadDefaultVendorManifest } from "./vendor-manifest";

const execFileAsync = promisify(execFile);
const AGENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(AGENT_ROOT, "../..");
const CLI_ENTRY = resolve(AGENT_ROOT, "src/cli.ts");
const PUBLIC_VENDOR = resolve(REPO_ROOT, "public/vendor");
const SAV_SAMPLE = resolve(REPO_ROOT, "viewer/plugins/stat-data/examples/iris.sav");

const READSTAT_JS = "readstat/1.1.9-anyfile.1/readstat.mjs";
const READSTAT_WASM = "readstat/1.1.9-anyfile.1/readstat.wasm";

describe("Node on-demand /vendor/ fetching and `cache add`", { timeout: 60_000 }, () => {
  let tempDir = "";
  let upstreamServer: Server | null = null;
  let upstreamUrl = "";
  let serveTamperedWasm = false;
  const requestedPaths: string[] = [];

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "anyfile-vendor-cache-test-"));
    const readstatJsBytes = await readFile(join(PUBLIC_VENDOR, READSTAT_JS));
    const readstatWasmBytes = await readFile(join(PUBLIC_VENDOR, READSTAT_WASM));

    upstreamServer = createServer((req, res) => {
      const urlPath = (req.url ?? "").replace(/^\/vendor\//, "");
      requestedPaths.push(urlPath);
      if (urlPath === READSTAT_JS) {
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        res.end(readstatJsBytes);
        return;
      }
      if (urlPath === READSTAT_WASM) {
        res.writeHead(200, { "content-type": "application/wasm" });
        res.end(serveTamperedWasm ? Buffer.from("corrupted-wasm-bytes") : readstatWasmBytes);
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });
    await new Promise<void>((resolveListen) => upstreamServer!.listen(0, "127.0.0.1", resolveListen));
    const addr = upstreamServer.address();
    if (!addr || typeof addr === "string") throw new Error("Failed to bind mock vendor upstream");
    upstreamUrl = `http://127.0.0.1:${addr.port}/vendor`;
  });

  afterAll(async () => {
    if (upstreamServer) {
      await new Promise<void>((resolveClose) => upstreamServer!.close(() => resolveClose()));
    }
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("filters out source archives and build scripts when resolving plugin vendor assets", () => {
    const manifest = loadDefaultVendorManifest();
    expect(isRuntimeVendorAsset("libredwg/0.14-anyfile.1/wasm/libredwg-web.wasm")).toBe(true);
    expect(isRuntimeVendorAsset("libredwg/0.14-anyfile.1/bindings-source.tar.gz")).toBe(false);
    expect(isRuntimeVendorAsset("libredwg/0.14-anyfile.1/fetch.mjs")).toBe(false);
    expect(isRuntimeVendorAsset("readstat/1.1.9-anyfile.1/build-info.json")).toBe(false);

    const statAssets = resolveVendorAssetsForPlugins(["statistical-data"], manifest);
    expect(statAssets).toEqual([READSTAT_JS, READSTAT_WASM]);

    const plistAssets = resolveVendorAssetsForPlugins(["apple-plist"], manifest);
    expect(plistAssets).toEqual([]);

    expect(() => resolveVendorAssetsForPlugins([], manifest)).toThrow(/Usage: anyfile cache add/);
    expect(() => resolveVendorAssetsForPlugins(["nonexistent-plugin-id"], manifest)).toThrow(/Unknown plugin id/);
  });

  it("fetches missing Node extractor WASM on demand via host, caches with SHA-256, and works offline afterwards", async () => {
    const cacheDir = join(tempDir, "worker-ondemand-cache");
    const vendorCacheRoot = join(cacheDir, "vendor");
    requestedPaths.length = 0;
    serveTamperedWasm = false;

    const service = new AgentService({
      allowedRoots: [dirname(SAV_SAMPLE)],
      persistent: false,
      vendorCacheRoot,
      vendorRoots: [vendorCacheRoot],
      vendorUpstreamBaseUrl: upstreamUrl,
    });
    try {
      const inspected = await service.inspectFile(SAV_SAMPLE);
      expect(inspected.pluginId).toBe("statistical-data");
      expect(inspected.capabilities).toContain("read");
      expect(inspected.targets.length).toBeGreaterThan(0);
    } finally {
      await service.dispose();
    }

    expect(requestedPaths).toContain(READSTAT_JS);
    expect(requestedPaths).toContain(READSTAT_WASM);
    const listed = await listVendorCache(cacheDir);
    expect(listed.entries.map((e) => e.path)).toEqual([READSTAT_JS, READSTAT_WASM]);

    // Second run with offline upstream must succeed purely from the populated cache.
    const offlineService = new AgentService({
      allowedRoots: [dirname(SAV_SAMPLE)],
      persistent: false,
      vendorCacheRoot,
      vendorRoots: [vendorCacheRoot],
      vendorUpstreamBaseUrl: "",
    });
    try {
      const readRes = await offlineService.readFile(SAV_SAMPLE, { maxBytes: 2048 });
      expect(readRes.pluginId).toBe("statistical-data");
      expect(readRes.content.length).toBeGreaterThan(0);
    } finally {
      await offlineService.dispose();
    }
  });

  it("rejects tampered upstream WASM with runtime-unavailable and does not leave corrupt files in cache", async () => {
    const cacheDir = join(tempDir, "worker-tampered-cache");
    const vendorCacheRoot = join(cacheDir, "vendor");
    serveTamperedWasm = true;

    const service = new AgentService({
      allowedRoots: [dirname(SAV_SAMPLE)],
      persistent: false,
      vendorCacheRoot,
      vendorRoots: [vendorCacheRoot],
      vendorUpstreamBaseUrl: upstreamUrl,
    });
    try {
      await expect(service.inspectFile(SAV_SAMPLE)).rejects.toMatchObject({
        code: "runtime-unavailable",
      });
    } finally {
      serveTamperedWasm = false;
      await service.dispose();
    }

    expect(existsSync(join(vendorCacheRoot, ...READSTAT_WASM.split("/")))).toBe(false);
  });

  it("pre-warms plugin runtime assets via addVendorCache and CLI `cache add`", async () => {
    const cacheDir = join(tempDir, "cli-cache-add");
    serveTamperedWasm = false;

    const first = await addVendorCache(["statistical-data"], {
      cacheDir,
      vendorUpstreamBaseUrl: upstreamUrl,
    });
    expect(first.downloaded.map((e) => e.path)).toEqual([READSTAT_JS, READSTAT_WASM]);
    expect(first.alreadyCached).toEqual([]);

    const second = await addVendorCache(["statistical-data"], {
      cacheDir,
      vendorUpstreamBaseUrl: upstreamUrl,
    });
    expect(second.downloaded).toEqual([]);
    expect(second.alreadyCached.map((e) => e.path)).toEqual([READSTAT_JS, READSTAT_WASM]);

    // Also test CLI subprocess end-to-end with ANYFILE_CACHE_DIR + ANYFILE_VENDOR_UPSTREAM_URL.
    const cliCacheDir = join(tempDir, "cli-subprocess-cache");
    const { stdout } = await execFileAsync(process.execPath, [CLI_ENTRY, "cache", "add", "statistical-data"], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        ANYFILE_CACHE_DIR: cliCacheDir,
        ANYFILE_VENDOR_UPSTREAM_URL: upstreamUrl,
      },
      timeout: 20_000,
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.downloaded.map((e: { path: string }) => e.path)).toEqual([READSTAT_JS, READSTAT_WASM]);

    // Invalid plugin id via CLI returns exit code 1 with invalid-argument JSON error.
    let badExitCode = 0;
    let badStderr = "";
    try {
      await execFileAsync(process.execPath, [CLI_ENTRY, "cache", "add", "no-such-plugin"], {
        cwd: REPO_ROOT,
        env: { ...process.env, ANYFILE_CACHE_DIR: cliCacheDir },
        timeout: 20_000,
      });
    } catch (error) {
      const err = error as { code?: number; stderr?: string };
      badExitCode = err.code ?? 1;
      badStderr = err.stderr ?? "";
    }
    expect(badExitCode).toBe(1);
    expect(JSON.parse(badStderr).code).toBe("invalid-argument");
  });
});
