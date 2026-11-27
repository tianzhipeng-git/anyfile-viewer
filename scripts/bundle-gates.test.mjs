import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkDualHostBundleIsolation } from "./check-dual-host-bundle.mjs";
import { generateVendorManifest, verifyVendorManifest } from "./vendor-manifest.mjs";

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "anyfile-bundle-gates-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("checkDualHostBundleIsolation passes on clean Web chunks and loadable manifest", () => {
  const result = checkDualHostBundleIsolation({
    chunks: [
      { fileName: "app-123.js", code: "console.log('clean web viewer chunk');" },
      { fileName: "plugin-456.js", code: "export function parseXml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }" },
    ],
    loadableManifest: {
      "viewer/registry/src/index.ts -> @anyfile/plist-viewer/probe": { files: ["static/chunks/probe.js"] },
      "src/lib/viewer-registrations.ts -> @anyfile/plist-viewer": { files: ["static/chunks/viewer.js"] },
    },
    extractPackages: ["@anyfile/plist-viewer", "@anyfile/sqlite-viewer"],
  });
  assert.deepEqual(result.violations, []);
});

test("checkDualHostBundleIsolation catches @anyfile/agent code in Web chunks", () => {
  const result = checkDualHostBundleIsolation({
    chunks: [
      { fileName: "leaked-agent.js", code: "const msg = 'Network access is disabled inside the extraction worker.';" },
    ],
    loadableManifest: {},
    extractPackages: [],
  });
  assert.ok(result.violations.length > 0);
  assert.match(result.violations[0], /leaked-agent\.js/);
});

test("checkDualHostBundleIsolation catches plugin ./extract modules in loadable manifest or chunks", () => {
  const manifestLeak = checkDualHostBundleIsolation({
    chunks: [],
    loadableManifest: {
      "src/app/page.tsx -> @anyfile/plist-viewer/extract": { files: ["static/chunks/extract.js"] },
    },
    extractPackages: ["@anyfile/plist-viewer"],
  });
  assert.ok(manifestLeak.violations.length > 0);
  assert.match(manifestLeak.violations[0], /extract/);

  const chunkLeak = checkDualHostBundleIsolation({
    chunks: [
      { fileName: "leaked-extract.js", code: "import('@anyfile/sqlite-viewer/extract');" },
    ],
    loadableManifest: {},
    extractPackages: ["@anyfile/sqlite-viewer"],
  });
  assert.ok(chunkLeak.violations.length > 0);
  assert.match(chunkLeak.violations[0], /leaked-extract\.js/);
});

test("checkDualHostBundleIsolation catches Node-only XML parser (happy-dom / xml.node) in Web chunks", () => {
  const happyDomLeak = checkDualHostBundleIsolation({
    chunks: [
      { fileName: "leaked-xml.js", code: "new Window({ settings: { disableJavaScriptEvaluation: true, disableIframePageLoading: true } });" },
    ],
    loadableManifest: {},
    extractPackages: [],
  });
  assert.ok(happyDomLeak.violations.length > 0);
  assert.match(happyDomLeak.violations[0], /leaked-xml\.js/);

  const nodeVendorLeak = checkDualHostBundleIsolation({
    chunks: [
      { fileName: "leaked-node-vendor.js", code: "const root = getVendorCacheRoot(process.env.ANYFILE_CACHE_DIR);" },
    ],
    loadableManifest: {},
    extractPackages: [],
  });
  assert.ok(nodeVendorLeak.violations.length > 0);
  assert.match(nodeVendorLeak.violations[0], /leaked-node-vendor\.js/);
});

test("vendor manifest generation and integrity verification catch missing, tampered, and extra files", async () => {
  await withTempDir(async (vendorRoot) => {
    await mkdir(join(vendorRoot, "readstat/1.1.9-anyfile.1"), { recursive: true });
    await mkdir(join(vendorRoot, "h5wasm/0.10.3"), { recursive: true });
    await mkdir(join(vendorRoot, "licenses/mediabunny/1.55.3"), { recursive: true });

    await writeFile(join(vendorRoot, "readstat/1.1.9-anyfile.1/readstat.wasm"), "wasm-bytes");
    await writeFile(join(vendorRoot, "h5wasm/0.10.3/h5wasm.mjs"), "export default 1;");
    await writeFile(join(vendorRoot, "licenses/mediabunny/1.55.3/MPL-2.0.txt"), "license");

    const manifest = await generateVendorManifest(vendorRoot);
    assert.equal(manifest.schemaVersion, 1);
    assert.deepEqual(Object.keys(manifest.assets), [
      "h5wasm/0.10.3/h5wasm.mjs",
      "readstat/1.1.9-anyfile.1/readstat.wasm",
    ]);

    // Clean verify passes.
    const verified = await verifyVendorManifest(vendorRoot);
    assert.equal(verified.assetCount, 2);

    // Tampered file fails.
    await writeFile(join(vendorRoot, "readstat/1.1.9-anyfile.1/readstat.wasm"), "tampered!");
    await assert.rejects(() => verifyVendorManifest(vendorRoot), /SHA-256|size|mismatch/i);

    // Restore and add an unlisted extra file -> fails.
    await writeFile(join(vendorRoot, "readstat/1.1.9-anyfile.1/readstat.wasm"), "wasm-bytes");
    await writeFile(join(vendorRoot, "h5wasm/0.10.3/extra.wasm"), "extra");
    await assert.rejects(() => verifyVendorManifest(vendorRoot), /unlisted|missing from manifest/i);

    // Remove extra file, delete listed file -> fails.
    await unlink(join(vendorRoot, "h5wasm/0.10.3/extra.wasm"));
    await unlink(join(vendorRoot, "h5wasm/0.10.3/h5wasm.mjs"));
    await assert.rejects(() => verifyVendorManifest(vendorRoot), /missing/i);
  });
});
