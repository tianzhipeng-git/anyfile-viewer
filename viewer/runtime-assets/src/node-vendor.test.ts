// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeVendorAssets, loadVendorManifest, parseVendorManifest, sha256Hex } from "./node-vendor";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function root(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "anyfile-vendor-test-"));
  tempDirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}

describe("Node vendor assets", () => {
  it("resolves from the first root that has the asset and verifies manifest hashes", async () => {
    const cache = await root({ "pkg/1.0.0/a.wasm": "cached" });
    const repo = await root({ "pkg/1.0.0/a.wasm": "repo", "pkg/1.0.0/b.mjs": "glue" });
    const vendor = createNodeVendorAssets([cache, repo], { "pkg/1.0.0/b.mjs": sha256Hex(new TextEncoder().encode("glue")) });
    expect(new TextDecoder().decode(await vendor.bytes("pkg/1.0.0/a.wasm"))).toBe("cached");
    expect(await vendor.url("pkg/1.0.0/b.mjs")).toMatch(/^file:.*b\.mjs$/);

    const tampered = createNodeVendorAssets([repo], { "pkg/1.0.0/b.mjs": "0".repeat(64) });
    await expect(tampered.bytes("pkg/1.0.0/b.mjs")).rejects.toMatchObject({ code: "runtime-unavailable" });
    await expect(vendor.bytes("pkg/1.0.0/missing.wasm")).rejects.toMatchObject({ code: "runtime-unavailable" });
  });

  it("rejects traversal and directory paths", async () => {
    const dir = await root({ "pkg/1.0.0/subdir/file.txt": "x" });
    const vendor = createNodeVendorAssets([dir]);
    await expect(vendor.bytes("../etc/1/passwd")).rejects.toThrow(/Invalid vendor asset path/);
    await expect(vendor.bytes("pkg/1.0.0/../../secret")).rejects.toThrow(/Invalid vendor asset path/);
    await expect(vendor.bytes("pkg/1.0.0/subdir")).rejects.toMatchObject({ code: "runtime-unavailable" });
  });

  it("parses, loads, and verifies structured VendorManifest files", async () => {
    const content = "wasm-binary-data";
    const hash = sha256Hex(new TextEncoder().encode(content));
    const manifestJson = JSON.stringify({
      schemaVersion: 1,
      assets: {
        "pkg/1.0.0/engine.wasm": { sha256: hash, bytes: content.length },
      },
    });
    const dir = await root({
      "pkg/1.0.0/engine.wasm": content,
      "manifest.json": manifestJson,
    });

    const loaded = await loadVendorManifest(join(dir, "manifest.json"));
    expect(loaded).toBeDefined();
    expect(loaded?.assets["pkg/1.0.0/engine.wasm"]).toEqual({ sha256: hash, bytes: content.length });

    const vendor = createNodeVendorAssets([dir], loaded);
    expect(new TextDecoder().decode(await vendor.bytes("pkg/1.0.0/engine.wasm"))).toBe(content);

    const badManifest = parseVendorManifest({
      schemaVersion: 1,
      assets: {
        "pkg/1.0.0/engine.wasm": { sha256: "f".repeat(64), bytes: content.length },
      },
    });
    const tamperedVendor = createNodeVendorAssets([dir], badManifest);
    await expect(tamperedVendor.bytes("pkg/1.0.0/engine.wasm")).rejects.toMatchObject({ code: "runtime-unavailable" });

    expect(() => parseVendorManifest({ schemaVersion: 2, assets: {} })).toThrow(/schemaVersion/i);
    expect(() => parseVendorManifest({
      schemaVersion: 1,
      assets: { "pkg/1.0.0/engine.wasm": { sha256: "not-hex", bytes: 1 } },
    })).toThrow(/sha256/i);
  });
});
