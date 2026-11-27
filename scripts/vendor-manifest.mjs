import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const VENDOR_MANIFEST_FILE = "manifest.json";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

async function walkVendorFiles(vendorRoot, currentDir = vendorRoot) {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    const relPath = relative(vendorRoot, fullPath).split(sep).join("/");
    if (relPath === VENDOR_MANIFEST_FILE || relPath === "licenses" || relPath.startsWith("licenses/")) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await walkVendorFiles(vendorRoot, fullPath)));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }
  return files;
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function generateVendorManifest(vendorRoot, manifestPath = join(vendorRoot, VENDOR_MANIFEST_FILE)) {
  const files = (await walkVendorFiles(vendorRoot)).sort((a, b) => a.localeCompare(b));
  const assets = {};
  for (const relPath of files) {
    const content = await readFile(join(vendorRoot, relPath));
    assets[relPath] = {
      sha256: sha256Hex(content),
      bytes: content.byteLength,
    };
  }
  const manifest = { schemaVersion: 1, assets };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function verifyVendorManifest(vendorRoot, manifestPath = join(vendorRoot, VENDOR_MANIFEST_FILE)) {
  let rawText;
  try {
    rawText = await readFile(manifestPath, "utf8");
  } catch {
    throw new Error(`Vendor SHA-256 manifest is missing at ${manifestPath}; run pnpm prepare:assets`);
  }

  const parsed = JSON.parse(rawText);
  if (parsed?.schemaVersion !== 1 || !parsed.assets || typeof parsed.assets !== "object" || Array.isArray(parsed.assets)) {
    throw new Error(`Vendor SHA-256 manifest at ${manifestPath} has invalid schema`);
  }

  const manifestEntries = Object.entries(parsed.assets);
  if (manifestEntries.length === 0) {
    throw new Error(`Vendor SHA-256 manifest at ${manifestPath} has no assets`);
  }

  for (const [relPath, expected] of manifestEntries) {
    if (!expected || typeof expected.sha256 !== "string" || !SHA256_PATTERN.test(expected.sha256) || typeof expected.bytes !== "number") {
      throw new Error(`Vendor SHA-256 manifest has invalid entry for ${relPath}`);
    }
    const content = await readFile(join(vendorRoot, relPath)).catch(() => undefined);
    if (!content) {
      throw new Error(`Vendor asset listed in manifest is missing: /vendor/${relPath}`);
    }
    if (content.byteLength !== expected.bytes) {
      throw new Error(`Vendor asset size mismatch for /vendor/${relPath}: expected ${expected.bytes} bytes, got ${content.byteLength}`);
    }
    const actualSha256 = sha256Hex(content);
    if (actualSha256 !== expected.sha256) {
      throw new Error(`Vendor asset SHA-256 mismatch for /vendor/${relPath}: expected ${expected.sha256}, got ${actualSha256}`);
    }
  }

  const diskFiles = await walkVendorFiles(vendorRoot);
  const unlisted = diskFiles.filter((relPath) => !(relPath in parsed.assets)).sort();
  if (unlisted.length > 0) {
    throw new Error(`Vendor files on disk are missing from manifest (${unlisted.length}): ${unlisted.slice(0, 5).join(", ")}`);
  }

  return { assetCount: manifestEntries.length, manifestPath };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const command = process.argv[2] ?? "generate";
  const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const vendorRoot = join(projectRoot, "public/vendor");
  if (command === "generate") {
    const manifest = await generateVendorManifest(vendorRoot);
    console.log(`Generated public/vendor/manifest.json (${Object.keys(manifest.assets).length} assets)`);
  } else if (command === "verify") {
    const result = await verifyVendorManifest(vendorRoot);
    console.log(`Verified public/vendor/manifest.json (${result.assetCount} assets)`);
  } else {
    throw new Error(`Unknown command "${command}"; expected "generate" or "verify"`);
  }
}
