import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const policyPath = join(projectRoot, "viewer/plugin-policies.json");
const policy = JSON.parse(await readFile(policyPath, "utf8"));
if (policy.schemaVersion !== 1) throw new Error("Unsupported viewer plugin policy schema");

const pluginsRoot = join(projectRoot, "viewer/plugins");
const registrationSource = await readFile(join(projectRoot, "src/lib/viewer-registrations.ts"), "utf8");
const pluginDirectories = (await readdir(pluginsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const discoveredPlugins = new Map();

for (const directory of pluginDirectories) {
  const root = join(pluginsRoot, directory);
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const manifestSource = await readFile(join(root, "src/manifest.ts"), "utf8");
  const id = manifestSource.match(/\bid:\s*["']([^"']+)["']/)?.[1];
  if (!id) throw new Error(`Viewer plugin ${directory} has no literal manifest id`);
  if (discoveredPlugins.has(id)) throw new Error(`Duplicate viewer plugin id ${id}`);
  discoveredPlugins.set(id, { directory, packageJson });

  if (packageJson.exports?.["."] !== "./src/index.ts" || packageJson.exports?.["./manifest"] !== "./src/manifest.ts") {
    throw new Error(`${packageJson.name} must export separate viewer and manifest entry points`);
  }
  const manifestImport = `from "${packageJson.name}/manifest"`;
  const viewerImport = `import("${packageJson.name}")`;
  if (!registrationSource.includes(manifestImport) || !registrationSource.includes(viewerImport)) {
    throw new Error(`${packageJson.name} is not statically registered by manifest and dynamically registered by viewer entry`);
  }
  if (packageJson.exports?.["./probe"] && !registrationSource.includes(`import("${packageJson.name}/probe")`)) {
    throw new Error(`${packageJson.name} exports a probe that is not dynamically registered`);
  }
}

const configuredIds = Object.keys(policy.plugins).sort();
const discoveredIds = [...discoveredPlugins.keys()].sort();
if (JSON.stringify(configuredIds) !== JSON.stringify(discoveredIds)) {
  const missing = discoveredIds.filter((id) => !configuredIds.includes(id));
  const stale = configuredIds.filter((id) => !discoveredIds.includes(id));
  throw new Error(`Viewer plugin policies do not match registrations; missing: ${missing.join(", ") || "none"}; stale: ${stale.join(", ") || "none"}`);
}

function globRegex(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else {
      expression += character.replace(/[\\^$+?.()|{}[\]]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`);
}

async function walk(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(relative(projectRoot, path).split(sep).join("/"));
  }
  return files;
}

const runtimeFiles = [
  ...(await walk(join(projectRoot, "public/vendor"))).filter((path) => !path.startsWith("public/vendor/licenses/")),
  ...(await walk(join(projectRoot, ".next/static/media"))).filter((path) => /\.wasm$|worker.*\.(?:js|mjs)$|pdf\.worker.*\.mjs$/i.test(path)),
];
const gzipSizes = new Map();
async function gzipBytes(path) {
  if (!gzipSizes.has(path)) {
    const content = await readFile(join(projectRoot, path));
    gzipSizes.set(path, gzipSync(content, { level: 9 }).byteLength);
  }
  return gzipSizes.get(path);
}

const claimedFiles = new Set();
const reports = [];
const singleLimit = policy.budgets.singleRuntimeAssetGzipMiB * 1024 * 1024;
const coldStartLimit = policy.budgets.coldStartRuntimeGzipMiB * 1024 * 1024;

for (const [id, pluginPolicy] of Object.entries(policy.plugins)) {
  const discovered = discoveredPlugins.get(id);
  if (pluginPolicy.directory !== discovered.directory || pluginPolicy.package !== discovered.packageJson.name) {
    throw new Error(`Viewer plugin policy identity mismatch for ${id}`);
  }
  const pluginSourceFiles = (await walk(join(pluginsRoot, pluginPolicy.directory, "src")))
    .filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  const pluginSource = (await Promise.all(pluginSourceFiles.map((path) => readFile(join(projectRoot, path), "utf8")))).join("\n");
  if (/\/vendor\/|cdn\.jsdelivr\.net|assets\.anyfile\.top|new URL\([^\n]+\.wasm/.test(pluginSource)
    && pluginPolicy.runtimeSets.length === 0) {
    throw new Error(`${id} references runtime assets but declares no runtime set`);
  }

  for (const runtime of pluginPolicy.runtimeSets) {
    if (!runtime.id || !runtime.version || !Array.isArray(runtime.sources) || runtime.sources.length === 0) {
      throw new Error(`${id} has an incomplete runtime asset declaration`);
    }
    if (runtime.sources.some((source) => !["jsdelivr", "r2", "same-origin"].includes(source))
      || runtime.sources.at(-1) !== "same-origin") {
      throw new Error(`${id}/${runtime.id} has an invalid runtime source order`);
    }
    if (runtime.versionPackageJson) {
      const versionPackage = JSON.parse(await readFile(join(projectRoot, runtime.versionPackageJson), "utf8"));
      if (versionPackage.version !== runtime.version) {
        throw new Error(`${id}/${runtime.id} policy version ${runtime.version} does not match installed ${versionPackage.version}`);
      }
    }
    if (runtime.sameOriginException && (
      typeof runtime.sameOriginException.reason !== "string"
      || typeof runtime.sameOriginException.architectureDocument !== "string"
      || typeof runtime.sameOriginException.measuredGzipBytes !== "number"
    )) {
      throw new Error(`${id}/${runtime.id} has an incomplete same-origin exception`);
    }
    const matchPatterns = runtime.assetPatterns.map(globRegex);
    const matches = runtimeFiles.filter((path) => matchPatterns.some((pattern) => pattern.test(path)));
    if (matches.length === 0) throw new Error(`${id}/${runtime.id} did not match any built runtime assets`);
    matches.forEach((path) => claimedFiles.add(path));

    const implementation = (await Promise.all((runtime.implementationFiles ?? []).map((path) => (
      readFile(join(projectRoot, path), "utf8")
    )))).join("\n");
    for (const marker of runtime.requiredMarkers ?? []) {
      if (!implementation.includes(marker)) throw new Error(`${id}/${runtime.id} is missing implementation marker: ${marker}`);
    }

    const sizes = await Promise.all(matches.map(async (path) => ({ path, bytes: await gzipBytes(path) })));
    const largest = sizes.reduce((current, item) => item.bytes > current.bytes ? item : current, sizes[0]);
    let largestColdStart = { id: "none", bytes: 0 };
    for (const group of runtime.coldStartGroups) {
      const patterns = group.assetPatterns.map(globRegex);
      const groupFiles = matches.filter((path) => patterns.some((pattern) => pattern.test(path)));
      if (groupFiles.length === 0) throw new Error(`${id}/${runtime.id}/${group.id} did not match any runtime assets`);
      const bytes = (await Promise.all(groupFiles.map(gzipBytes))).reduce((total, size) => total + size, 0);
      if (bytes > largestColdStart.bytes) largestColdStart = { id: group.id, bytes };
    }

    if (largest.bytes >= singleLimit || largestColdStart.bytes >= coldStartLimit) {
      const validExternalChain = ["jsdelivr,r2,same-origin", "r2,same-origin"].includes(runtime.sources.join(","));
      if (!validExternalChain && !runtime.sameOriginException) {
        throw new Error(`${id}/${runtime.id} exceeds the runtime transfer threshold without an external asset chain or documented exception`);
      }
    }
    reports.push({ id, runtime: runtime.id, largest, coldStart: largestColdStart, sources: runtime.sources });
  }
}

const unclaimed = runtimeFiles.filter((path) => !claimedFiles.has(path));
if (unclaimed.length > 0) {
  throw new Error(`Built runtime assets are missing from viewer/plugin-policies.json: ${unclaimed.join(", ")}`);
}

for (const report of reports) {
  console.log(`${report.id}/${report.runtime}: largest ${(report.largest.bytes / 1024).toFixed(1)} KiB gzip; cold start ${report.coldStart.id} ${(report.coldStart.bytes / 1024).toFixed(1)} KiB gzip; ${report.sources.join(" -> ")}`);
}
console.log(`${discoveredIds.length} viewer plugin policies cover ${runtimeFiles.length} built runtime assets`);
