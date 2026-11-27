import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FORBIDDEN_LOADABLE_PATTERNS = [
  { label: "@anyfile/agent", pattern: /(?:^|[\s"'/])@anyfile\/agent(?:\/|$)|(?:^|\/)viewer\/agent\// },
  { label: "plugin ./extract module", pattern: /(?:^|\/)(?:extract(?:\.[cm]?[jt]s)?|src\/extract(?:\.[cm]?[jt]s)?)(?:$|\s|["'])/ },
  { label: "Node-only runtime/XML module", pattern: /@anyfile\/runtime-assets\/node|\bxml\.node\b|\bhappy-dom\b/ },
];

const FORBIDDEN_CHUNK_MARKERS = [
  { label: "@anyfile/agent runtime", marker: "@anyfile/agent" },
  { label: "@anyfile/agent worker guard", marker: "Network access is disabled inside the extraction worker." },
  { label: "@anyfile/agent browser discovery", marker: "ANYFILE_BROWSER_PATH" },
  { label: "@anyfile/agent worker guard helper", marker: "installWorkerNetworkGuard" },
  { label: "@anyfile/agent workspace reader", marker: "createDiskWorkspaceReader" },
  { label: "@anyfile/agent disk source", marker: "DiskBinarySource" },
  { label: "@anyfile/agent extractor registry", marker: "extractorLoaders" },
  { label: "extractor compliance helper", marker: "assertExtractorCompliance" },
  { label: "Node-only vendor helper", marker: "@anyfile/runtime-assets/node" },
  { label: "Node-only vendor cache root", marker: "ANYFILE_CACHE_DIR" },
  { label: "Node-only vendor helper", marker: "getVendorCacheRoot" },
  { label: "Node-only vendor helper", marker: "createNodeVendorAssets" },
  { label: "Node-only XML parser (happy-dom)", marker: "happy-dom" },
  { label: "Node-only XML parser (xml.node)", marker: "disableJavaScriptEvaluation" },
  { label: "Node-only XML parser (xml.node)", marker: "disableIframePageLoading" },
];

const PLUGIN_EXTRACT_PATH_PATTERN = /viewer\/plugins\/[^/"'\s]+\/src\/extract\b/;

export function discoverExtractPackages(projectRoot) {
  const pluginsRoot = join(projectRoot, "viewer/plugins");
  if (!existsSync(pluginsRoot)) return [];
  const packages = [];
  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join(pluginsRoot, entry.name, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.exports?.["./extract"] && typeof pkg.name === "string") {
      packages.push(pkg.name);
    }
  }
  return packages.sort();
}

export function checkDualHostBundleIsolation({ chunks, loadableManifest = {}, extractPackages = [] }) {
  const violations = [];
  const extractSpecifiers = extractPackages.map((pkgName) => `${pkgName}/extract`);

  for (const key of Object.keys(loadableManifest)) {
    for (const { label, pattern } of FORBIDDEN_LOADABLE_PATTERNS) {
      if (pattern.test(key)) {
        violations.push(`react-loadable-manifest.json contains ${label}: ${key}`);
      }
    }
    for (const specifier of extractSpecifiers) {
      if (key.includes(specifier)) {
        violations.push(`react-loadable-manifest.json contains plugin ./extract specifier: ${key}`);
      }
    }
  }

  for (const { fileName, code } of chunks) {
    for (const { label, marker } of FORBIDDEN_CHUNK_MARKERS) {
      if (code.includes(marker)) {
        violations.push(`Web chunk ${fileName} contains ${label} (${marker})`);
      }
    }
    if (PLUGIN_EXTRACT_PATH_PATTERN.test(code)) {
      violations.push(`Web chunk ${fileName} contains plugin ./extract source path`);
    }
    for (const specifier of extractSpecifiers) {
      if (code.includes(specifier)) {
        violations.push(`Web chunk ${fileName} contains plugin ./extract specifier (${specifier})`);
      }
    }
  }

  return { violations };
}

export async function assertDualHostBundleIsolation(projectRoot, staticChunkContents) {
  const loadableManifestPath = join(projectRoot, ".next/react-loadable-manifest.json");
  const loadableManifest = existsSync(loadableManifestPath)
    ? JSON.parse(await readFile(loadableManifestPath, "utf8"))
    : {};
  const extractPackages = discoverExtractPackages(projectRoot);
  const chunks = staticChunkContents.map(({ fileName, content }) => ({
    fileName,
    code: typeof content === "string" ? content : content.toString("utf8"),
  }));

  const { violations } = checkDualHostBundleIsolation({ chunks, loadableManifest, extractPackages });
  if (violations.length > 0) {
    throw new Error(`Dual-host bundle isolation failed:\n- ${violations.join("\n- ")}`);
  }
  return { chunkCount: chunks.length, extractPackageCount: extractPackages.length };
}
